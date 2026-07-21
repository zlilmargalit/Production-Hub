const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { readJsonCached, writeJsonAndCache } = require('../cache');
const { dataPath, cacheKey, artistScopedId } = require('../utils/userData');

const DEFAULT_XLSX = path.join(__dirname, '../../אסף אמדורסקי לוח הופעות.xlsx');

// The shared "אסף אמדורסקי לוח הופעות" xlsx always belongs to the Assaf Amdursky
// workspace — regardless of which workspace the admin is viewing when they hit
// Sync. Imports must therefore target that artist's data files, not the legacy
// admin-root shows.json (which the UI never displays once artists exist).
// Override via IMPORT_ARTIST_ID if the source spreadsheet ever changes owner.
const IMPORT_ARTIST_ID = process.env.IMPORT_ARTIST_ID || '05dea0dd-dfc3-48c5-b49d-8e3f168ec8c9';
const IMPORT_UID = artistScopedId('admin', IMPORT_ARTIST_ID);

// The source spreadsheet holds YEARS of gig history. Only import shows dated
// within this window (default: last 45 days onward) so a sync adds genuinely
// new/upcoming shows rather than dumping the entire archive into the workspace.
const IMPORT_FLOOR_DAYS = Number(process.env.IMPORT_FLOOR_DAYS || 45);
// Safety net: if a single sync would add more than this, something is wrong
// (parse/dedup failure) — refuse to write and surface it instead of flooding
// the workspace. Overridable via IMPORT_MAX.
const IMPORT_MAX = Number(process.env.IMPORT_MAX || 40);

function importFloorStr() {
  const d = new Date();
  d.setDate(d.getDate() - IMPORT_FLOOR_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const readShows  = (uid) => readJsonCached(cacheKey(uid, 'shows'), dataPath(uid, 'shows.json'), []);
const writeShows = (uid, shows) => writeJsonAndCache(cacheKey(uid, 'shows'), dataPath(uid, 'shows.json'), shows);

const pathExists = (p) => fsp.access(p).then(() => true).catch(() => false);

// Map raw event type from the xlsx to our app's event type labels
function mapEventType(sheetName, rawType) {
  if (sheetName === 'אני גיטרה') return 'אני גיטרה';
  if (!rawType) return '';
  const t = String(rawType).trim().replace(/\s+/g, ' ');
  if (typeof rawType === 'number') return ''; // skip numeric junk
  if (/^סולו/.test(t) || t === 'אקוסטי') return 'סולו פסנתר';
  if (t === 'להקה') return 'להקה';
  if (t === 'תקלוט') return 'תקלוט';
  if (t === 'מפגש אמן' || t === 'כתת אמן') return 'אירוח';
  if (t === 'מארח' || t.startsWith('מארח') || t === 'מתארח' || t.startsWith('מתארח')) return 'אירוח';
  if (t === 'שר בני' || t.startsWith('שר בני')) return 'אני גיטרה';
  return t;
}

function toDateStr(val) {
  if (!val) return null;
  let d;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    // Excel serial date
    const info = XLSX.SSF.parse_date_code(val);
    if (!info) return null;
    d = new Date(info.y, info.m - 1, info.d);
  } else {
    return null;
  }
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 2000 || y > 2100) return null;
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Format a raw contact string into "Name (role) — phone" style.
// Already-formatted strings (containing parentheses or " - ") are left as-is.
// Plain "Name Phone" is reformatted to "Name (הפקה) — Phone".
function formatContact(raw) {
  if (!raw) return '';
  // If already formatted (has parentheses or dash-separator), keep as-is
  if (/[()]/.test(raw) || / - \d/.test(raw)) return raw;
  // Try to split off a trailing Israeli phone number
  const phoneRe = /(\b0\d[\d\-]{7,10}\b)/;
  const match = raw.match(phoneRe);
  if (!match) return raw; // no phone found — leave as-is
  const phone = match[1];
  const name = raw.replace(phone, '').trim().replace(/\s+/g, ' ');
  if (!name) return phone;
  return `${name} (הפקה) — ${phone}`;
}

function parseSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const results = [];

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const dateStr = toDateStr(row[0]);
    if (!dateStr) continue;

    const rawType  = row[2];
    const venue    = String(row[3] || '').trim();
    const contact  = String(row[4] || '').trim();
    const sound    = String(row[5] || '').trim();
    const booking  = String(row[6] || '').trim();
    const duration = String(row[7] || '').trim();
    const crowd    = String(row[8] || '').trim();
    const notes    = String(row[9] || '').trim();

    const eventType = mapEventType(sheetName, rawType);

    // Skip חלונות entries embedded in the Asaf sheet, and skip truly empty rows
    if (String(rawType || '').trim().startsWith('חלונות')) continue;
    if (!venue && !eventType) continue;

    // Build a readable show name
    const name = venue || eventType || `מופע ${dateStr}`;

    const additionalParts = [
      booking  ? `בוקינג: ${booking}`  : '',
      duration ? `אורך: ${duration}`   : '',
      crowd    ? `קהל: ${crowd}`       : '',
    ].filter(Boolean);

    results.push({
      date: dateStr,
      name,
      eventType,
      venue,
      contacts: formatContact(contact),
      technicalCrew: sound,
      notes,
      additionalDetails: additionalParts.join(' | '),
      _sheet: sheetName,
    });
  }
  return results;
}

// Normalize venue string for fuzzy comparison
function normalizeVenue(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/['"״׳,\-()"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Two venues "match" if one contains the other
// e.g. "עין גב" matches "פסטיבל עין גב", "טרקלין" matches "סולו טרקלין פרדס חנה"
function venueOverlaps(a, b) {
  const na = normalizeVenue(a);
  const nb = normalizeVenue(b);
  if (!na && !nb) return true;   // both empty on same date → duplicate
  if (!na || !nb) return false;  // one has venue, other doesn't → different show
  return na === nb || na.includes(nb) || nb.includes(na);
}

function findNewShows(xlsxPath, existingShows) {
  const wb = XLSX.readFile(xlsxPath);
  const newShows = [];
  const floor = importFloorStr();

  for (const sheetName of ['אסף אמדורסקי', 'אני גיטרה']) {
    for (const s of parseSheet(wb, sheetName)) {
      // Skip archive rows: only import recent/upcoming shows, never years of history
      if (s.date < floor) continue;

      // Fuzzy dedup: same date + overlapping venue = same show
      const isDupe = [...existingShows, ...newShows].some(
        e => e.date === s.date && venueOverlaps(e.venue, s.venue)
      );
      if (isDupe) continue;

      const { _sheet, ...data } = s;
      newShows.push({
        id: uuidv4(),
        ...data,
        invoice: false,
        receipt: false,
        archived: false,
        crewIds: [],
        tasks: [],
        createdAt: new Date().toISOString(),
      });
    }
  }
  return newShows;
}

// POST /api/import/preview — returns what would be added without saving
router.post('/preview', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const xlsxPath = req.body.path || DEFAULT_XLSX;
  if (!(await pathExists(xlsxPath))) {
    return res.status(404).json({ error: 'Excel file not found', path: xlsxPath });
  }
  try {
    const existing = await readShows(IMPORT_UID);
    const newShows = findNewShows(xlsxPath, existing);
    res.json({
      count: newShows.length,
      shows: newShows.map(s => ({ date: s.date, name: s.name, eventType: s.eventType })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/sync — checks Gmail first (if configured), then syncs from local xlsx
router.post('/sync', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  let gmailAdded = 0;
  try {
    const { checkGmail } = require('../gmail-poll');
    const result = await checkGmail({ force: true }); // force = bypass time-window check
    gmailAdded = result?.added || 0;
  } catch (err) {
    console.error('[sync] Gmail check skipped:', err.message);
  }

  const xlsxPath = req.body.path || DEFAULT_XLSX;
  if (!(await pathExists(xlsxPath))) {
    return res.json({ added: gmailAdded });
  }
  try {
    const existing = await readShows(IMPORT_UID);
    const newShows = findNewShows(xlsxPath, existing);
    if (newShows.length > IMPORT_MAX) {
      console.error(`[sync] Refusing to import ${newShows.length} shows (> ${IMPORT_MAX}) — likely a parse/dedup issue`);
      return res.status(409).json({
        added: gmailAdded,
        blocked: newShows.length,
        error: `Refused to add ${newShows.length} shows at once (safety cap ${IMPORT_MAX}). This usually means a dedup/parse problem — nothing was written.`,
      });
    }
    if (newShows.length > 0) await writeShows(IMPORT_UID, [...existing, ...newShows]);
    res.json({ added: newShows.length + gmailAdded, shows: newShows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, findNewShows, DEFAULT_XLSX, IMPORT_ARTIST_ID, IMPORT_UID, IMPORT_MAX };

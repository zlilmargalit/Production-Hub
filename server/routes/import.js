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

// The source spreadsheet holds YEARS of gig history. A schedule sync must ONLY
// ever add upcoming shows — never past ones. So the floor is today (0 days back).
// (Overridable via IMPORT_FLOOR_DAYS if a small grace window is ever wanted.)
const IMPORT_FLOOR_DAYS = Number(process.env.IMPORT_FLOOR_DAYS || 0);
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

    // Skip חלונות entries embedded in the Asaf sheet
    if (String(rawType || '').trim().startsWith('חלונות')) continue;
    // A real show has a place. Rows with no מקום are placeholders (e.g. blank
    // "אני גיטרה" rows) — skip them so we never invent ghost shows.
    if (!venue) continue;

    // Name = the ensemble-type word from the "סוג הרכב" column (סולו / מתארח /
    // להקה …) followed by the place, matching how shows are named in the app.
    // The "אני גיטרה" sheet is itself the type, so it supplies the type word.
    const typeWord = sheetName === 'אני גיטרה'
      ? 'אני גיטרה'
      : (typeof rawType === 'number' ? '' : String(rawType || '').trim().replace(/\s+/g, ' '));
    // Commas are stripped from the name so the title reads cleanly, e.g.
    // "מתארח אצל ארקדי דוכין לייב פארק ראשלצ" (place kept intact in the venue field).
    const name = [typeWord, venue].filter(Boolean).join(' ')
      .replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

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

// ── Robust Hebrew place matching for dedup ─────────────────────────────────
// Goal: the same venue written slightly differently in the email vs. in the app
// must be recognised as the same show — e.g. "תיאטרון המסילה פ״ת" ==
// "תיאטרון המסילה פתח תקווה", "צל החורש, אירוע חברה" == "סולו בצל החורש".

// Israeli city abbreviations → full form (compared after punctuation is stripped,
// so "פ״ת" arrives here as "פת").
const CITY_ABBREV = {
  'פת': 'פתח תקווה', 'תא': 'תל אביב', 'קש': 'קרית שמונה', 'רג': 'רמת גן',
  'בש': 'באר שבע', 'ראשלצ': 'ראשון לציון', 'כס': 'כפר סבא', 'רח': 'רחובות',
};
// Filler words that carry no venue identity.
const STOPWORDS = new Set([
  'אצל', 'של', 'עם', 'על', 'את', 'או', 'אירוע', 'חברה', 'מופע', 'הופעה',
  'ערב', 'יום', 'עם', 'ה', 'ב', 'ל', 'מ', 'ו',
]);
// Ensemble-type / genre / project words. These prefix the show name (e.g.
// "אני גיטרה עמק חפר", "מנועים שקטים גבעת ברנר") but are NOT part of the venue,
// so they're excluded from place matching — otherwise the same venue written
// with vs without the type prefix fails to dedupe.
const TYPE_WORDS = new Set([
  'אני', 'גיטרה', 'סולו', 'פסנתר', 'אקוסטי', 'מתארח', 'מארח', 'מתארחת', 'להקה',
  'תקלוט', 'אירוח', 'מפגש', 'אמן', 'כתת', 'מנועים', 'שקטים', 'החלונות', 'חלונות',
  'הגבוהים', 'תקליטן',
]);

function normHeb(str) {
  return String(str || '')
    .replace(/[֑-ׇ]/g, '')                      // niqqud / cantillation
    .replace(/["'`״׳.,()\[\]{}\/\\|:;!?\-–—_]/g, ' ')     // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Significant tokens: punctuation stripped, city abbreviations expanded,
// stopwords and 1-char tokens dropped.
function sigTokens(str) {
  const out = [];
  for (const tok of normHeb(str).split(' ')) {
    if (!tok) continue;
    if (CITY_ABBREV[tok]) { for (const w of CITY_ABBREV[tok].split(' ')) out.push(w); continue; }
    if (tok.length < 2 || STOPWORDS.has(tok) || TYPE_WORDS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

function levSim(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// Two tokens match if they're close spellings (תיאטרון≈תאטרון) — comparing both
// the raw forms and the forms with a leading Hebrew prefix letter removed
// (so "בצל"≈"צל", "המסילה"≈"מסילה").
function tokenMatch(s, l) {
  if (levSim(s, l) >= 0.8) return true;
  const strip = (t) => (t.length > 2 && /^[בלמהוכש]/.test(t) ? t.slice(1) : t);
  return levSim(strip(s), strip(l)) >= 0.85;
}

// Do two place strings refer to the same venue? Robust to spelling, abbreviations,
// added qualifiers and word order: a majority of the shorter string's significant
// tokens must fuzzy-match a token in the longer string.
function placesMatch(a, b) {
  const ta = sigTokens(a), tb = sigTokens(b);
  if (!ta.length || !tb.length) return false;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let matched = 0;
  for (const s of small) if (large.some((l) => tokenMatch(s, l))) matched++;
  return matched >= Math.max(1, Math.ceil(small.length * 0.6));
}

// Same show = same date AND the imported place matches the existing show's venue
// OR its name (curated shows carry the venue inside the name, e.g.
// "סולו תיאטרון המסילה פתח תקווה").
function isSameShow(existing, s) {
  if (existing.date !== s.date) return false;
  const targets = [existing.venue, existing.name].filter(Boolean);
  return targets.some((t) => placesMatch(t, s.venue));
}

function findNewShows(xlsxPath, existingShows) {
  const wb = XLSX.readFile(xlsxPath);
  const newShows = [];
  const floor = importFloorStr();

  for (const sheetName of ['אסף אמדורסקי', 'אני גיטרה']) {
    for (const s of parseSheet(wb, sheetName)) {
      // Only import upcoming shows — never past ones (a new schedule adds new gigs)
      if (s.date < floor) continue;

      // Robust dedup: same date + fuzzy place/name match = same show
      const isDupe = [...existingShows, ...newShows].some((e) => isSameShow(e, s));
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

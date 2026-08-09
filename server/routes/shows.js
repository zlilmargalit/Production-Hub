const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const { google } = require('googleapis');

const { readJsonCached, writeJsonAndCache } = require('../cache');
const { htmlToPdfBuffer } = require('../pdf');
const { dataPath, cacheKey, DATA_DIR, parseUserId } = require('../utils/userData');

const { scheduleToString } = require('../utils/schedule');

const execFileP = promisify(execFile);

// Embedded Hebrew web font (Heebo, OFL). The Nixpacks/Railway Chromium image
// ships with NO Hebrew-capable system font, so every Hebrew text node rendered
// invisibly in the generated PDF (CSS boxes drew, glyphs didn't). Embedding the
// font as a base64 @font-face makes rendering self-contained — Chromium no
// longer depends on system fontconfig finding a Hebrew face. Loaded once.
let _heeboDataUrl = null;
function getHeeboDataUrl() {
  if (_heeboDataUrl === null) {
    try {
      const b64 = fs.readFileSync(path.join(__dirname, '../assets/Heebo.ttf')).toString('base64');
      _heeboDataUrl = `data:font/ttf;base64,${b64}`;
    } catch (e) {
      console.error('[pdf] Heebo font not found, falling back to system fonts:', e.message);
      _heeboDataUrl = '';
    }
  }
  return _heeboDataUrl;
}

// Crew roles that represent musicians — covers English and legacy Hebrew values.
const MUSICIAN_ROLES = new Set(['Musician', 'Musicians', 'נגן', 'נגנים']);

// ── Static paths (Google credentials remain global) ─────────────────────────
const CREDENTIALS_PATH = path.join(__dirname, '../data/gmail-credentials.json');
const TOKEN_PATH       = path.join(__dirname, '../data/gmail-token.json');

// On macOS (local), default to saving PDFs to the production folder.
// On Railway/Linux (no PDF_DIR env var), default to '' so the PDF is
// streamed back as a download instead of trying to write to a Mac path.
const PDF_DIR = process.env.PDF_DIR !== undefined
  ? process.env.PDF_DIR
  : process.platform === 'darwin'
    ? '/Users/zlilmargalit/Desktop/Production/דפי תיאום'
    : '';
const TEMPLATE_DOC_ID   = process.env.TEMPLATE_DOC_ID || '1ZBXxhG14W91wBKdvW96Qu8-kQmIX2ZpNY58psVsqhDs';
const TEMPLATE_DOCX_PATH = path.join(__dirname, '../data/brief-template.docx');

// ── Per-user cached file readers ────────────────────────────────────────────
const readShows  = (uid) => readJsonCached(cacheKey(uid, 'shows'),          dataPath(uid, 'shows.json'),           []);
const writeShows = (uid, shows) => writeJsonAndCache(cacheKey(uid, 'shows'), dataPath(uid, 'shows.json'),          shows);
const readCrew   = (uid) => readJsonCached(cacheKey(uid, 'crew'),           dataPath(uid, 'crew.json'),            []);
const readFieldTemplates = (uid) => readJsonCached(cacheKey(uid, 'fieldTemplates'), dataPath(uid, 'field-templates.json'), {});
const readTemplates      = (uid) => readJsonCached(cacheKey(uid, 'templates'),      dataPath(uid, 'templates.json'),       {});

// ── Google auth ─────────────────────────────────────────────────────────────
// Delegates to server/utils/googleAuth.js: prefers a Service Account (no
// expiry, no refresh flow, permanent) and falls back to the legacy OAuth
// refresh-token dance only if no service account is configured.
const { getGoogleAuth, isServiceAccountConfigured } = require('../utils/googleAuth');

// Upload a data-URL to Google Drive, make it publicly readable, return a direct view URL.
async function uploadDataUrlToDrive(dataUrl, filename) {
  const auth  = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)[1];
  const buffer  = Buffer.from(base64, 'base64');
  const res = await drive.files.create({
    requestBody: { name: filename },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  });
  const fileId = res.data.id;
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// Convert a PDF data-URL to a PNG data-URL (first page only).
// Tries three methods in order:
//   1. pdftoppm (poppler) — cross-platform; on Railway always available
//   2. sips — macOS built-in, works for most PDFs
//   3. Puppeteer screenshot — guaranteed fallback on any platform
async function pdfDataUrlToPng(pdfDataUrl) {
  const base64 = pdfDataUrl.split(',')[1];
  if (!base64) return null;

  const stamp      = Date.now();
  const tmpPdf     = path.join(os.tmpdir(), `hub-pdf-${stamp}.pdf`);
  const tmpPngBase = path.join(os.tmpdir(), `hub-pdf-${stamp}-out`);
  await fsp.writeFile(tmpPdf, Buffer.from(base64, 'base64'));

  let pngB64 = null;

  // ── 1. sips (macOS built-in) — fast, no extra deps ──────────────────
  if (process.platform === 'darwin') {
    try {
      const tmpPng = tmpPngBase + '-sips.png';
      await execFileP('sips', ['-s', 'format', 'png', tmpPdf, '--out', tmpPng], { timeout: 15000 });
      const stat = await fsp.stat(tmpPng).catch(() => null);
      if (stat && stat.size > 0) {
        pngB64 = (await fsp.readFile(tmpPng)).toString('base64');
      }
      await fsp.unlink(tmpPng).catch(() => {});
    } catch { /* sips failed or not macOS */ }
  }

  // ── 2. pdftoppm (poppler — available on Railway / if brew-installed) ──
  if (!pngB64) {
    try {
      const outBase = tmpPngBase + '-pp';
      await execFileP('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', tmpPdf, outBase], { timeout: 15000 });
      const dir  = path.dirname(outBase);
      const base = path.basename(outBase);
      const hits = (await fsp.readdir(dir)).filter(f => f.startsWith(base) && f.endsWith('.png'));
      if (hits.length > 0) {
        pngB64 = (await fsp.readFile(path.join(dir, hits[0]))).toString('base64');
        await fsp.unlink(path.join(dir, hits[0])).catch(() => {});
      }
    } catch { /* pdftoppm not installed */ }
  }

  // ── 3. Puppeteer via file:// URL (reliable: Chrome renders PDF natively) ──
  // We navigate Chrome to the temp PDF file on disk rather than a data URL.
  // Chrome's built-in PDF viewer handles file:// reliably in headless mode.
  if (!pngB64) {
    let puppeteerPage = null;
    try {
      const { getBrowser } = require('../pdf');
      const browser = await getBrowser();
      puppeteerPage = await browser.newPage();
      await puppeteerPage.setViewport({ width: 1240, height: 1754 }); // A4 @ ~150 dpi
      await puppeteerPage.goto(`file://${tmpPdf}`, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1500)); // let PDF viewer finish painting
      const shot = await puppeteerPage.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1240, height: 1754 } });
      pngB64 = Buffer.from(shot).toString('base64');
      console.log('[pdfDataUrlToPng] Puppeteer file:// succeeded');
    } catch (e) {
      console.error('[pdfDataUrlToPng] Puppeteer fallback failed:', e.message);
    } finally {
      if (puppeteerPage) await puppeteerPage.close().catch(() => {});
    }
  }

  await fsp.unlink(tmpPdf).catch(() => {});

  if (!pngB64) {
    console.warn('[pdfDataUrlToPng] all conversion methods failed — image will be omitted');
    return null;
  }
  return `data:image/png;base64,${pngB64}`;
}

// Find-or-create the "הפקות" folder in Drive; returns its ID.
async function getOrCreateHapakoFolder(drive) {
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name='הפקות' and trashed=false",
    fields: 'files(id)',
    pageSize: 1,
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name: 'הפקות', mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.data.id;
}

// Normalize DOCX XML: merge consecutive <w:r> runs whose text together forms
// a {{PLACEHOLDER}} token. Word sometimes splits e.g. {{TECHNICA_CREW}} across
// five separate runs ({{, TECHNICA, _, CREW, }}) which breaks string replacement.
function mergeRunsInXml(xml) {
  // Pattern for the XML "bridge" between two adjacent runs:
  //   </w:t></w:r>  <w:r [attrs]>  [optional <w:rPr>...</w:rPr>]  <w:t [attrs]>
  const rb = String.raw`</w:t></w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?</w:rPr>)?<w:t[^>]*>`;
  // Match {{ ... }} where content is word-chars or run-bridges
  const re = new RegExp(String.raw`\{\{(?:[A-Z_0-9]+|` + rb + String.raw`)*\}\}`, 'g');
  return xml.replace(re, (match) => match.replace(new RegExp(rb, 'g'), ''));
}

// Locate a section in document.xml: the paragraph holding {{PLACEHOLDER}} plus
// the header paragraph immediately before it. Returns character offsets.
function findBriefSection(xml, ph) {
  const phIdx = xml.indexOf(ph);
  if (phIdx === -1) return null;
  const valStart  = xml.lastIndexOf('<w:p ', phIdx);
  const valEndTag = xml.indexOf('</w:p>', phIdx);
  if (valStart === -1 || valEndTag === -1) return null;
  const hdrStart = xml.lastIndexOf('<w:p ', valStart - 1);
  if (hdrStart === -1) return null;
  return { hdrStart, valStart, valEnd: valEndTag + '</w:p>'.length };
}

// Build a new section by cloning an existing one, so injected fields inherit the
// template's exact fonts, borders and RTL settings rather than being hand-rolled.
// The cloned chunk contains exactly two text nodes — the header label and the
// placeholder — which makes the substitution unambiguous.
function buildBriefSection(xml, label, valueXml) {
  const ref = findBriefSection(xml, '{{CONTACTS}}');
  if (!ref) return '';
  let chunk = xml.slice(ref.hdrStart, ref.valEnd);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let seen = 0;
  chunk = chunk.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (m, open, _txt, close) => {
    seen += 1;
    if (seen === 1) return `${open}${esc(label)}${close}`;   // header label
    if (seen === 2) return `${open}${valueXml}${close}`;     // value
    return m;
  });
  return chunk;
}

// Insert extra sections the template has no placeholder for, each after the
// section it should follow, so the brief carries the same fields as the PDF.
function insertBriefExtras(xml, extras, toDocx) {
  for (const { after, label, value } of extras) {
    const section = buildBriefSection(xml, label, toDocx(value));
    if (!section) continue;
    const anchor = findBriefSection(xml, after);
    if (anchor) xml = xml.slice(0, anchor.valEnd) + section + xml.slice(anchor.valEnd);
    else {
      // Anchor missing (its field was empty and the section removed) — fall back
      // to placing it before the closing body so the content is never dropped.
      const end = xml.lastIndexOf('</w:body>');
      if (end !== -1) xml = xml.slice(0, end) + section + xml.slice(end);
    }
  }
  return xml;
}

// Remove a whole section from the brief's document.xml: the value paragraph that
// holds {{PLACEHOLDER}} plus the section-header paragraph immediately before it.
// Used to drop fields that are empty/unchecked so only selected fields render.
function removeBriefSection(xml, ph) {
  const phIdx = xml.indexOf(ph);
  if (phIdx === -1) return xml;
  const valStart = xml.lastIndexOf('<w:p ', phIdx);           // value paragraph start
  const valEndTag = xml.indexOf('</w:p>', phIdx);             // value paragraph end
  if (valStart === -1 || valEndTag === -1) return xml;
  const valEnd = valEndTag + '</w:p>'.length;
  const hdrStart = xml.lastIndexOf('<w:p ', valStart - 1);    // header paragraph start
  if (hdrStart === -1) return xml;
  return xml.slice(0, hdrStart) + xml.slice(valEnd);
}

// Create a coordination-sheet Google Doc by filling the DOCX template and
// uploading it to Drive (Drive auto-converts DOCX → Google Doc on upload).
async function createBriefDoc(payload) {
  const AdmZip = require('adm-zip');
  const auth  = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  // ── 1. Load template + fill placeholders ─────────────────────────────────
  const zip = new AdmZip(TEMPLATE_DOCX_PATH);
  let docXml = zip.readAsText('word/document.xml');

  // Fix split placeholders — Word sometimes stores {{TECHNICA_CREW}} as 5 runs
  docXml = mergeRunsInXml(docXml);

  // XML-encode text; split multi-line values into proper OOXML line-break runs
  const toDocx = (text) => {
    if (!text) return '';
    const x = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = String(text).split('\n');
    if (lines.length === 1) return x(text);
    // New runs must explicitly clear bold so they don't inherit the paragraph's
    // default bold style in Google Docs after conversion.
    const noB = '<w:rPr><w:b w:val="0"/><w:bCs w:val="0"/></w:rPr>';
    return lines.map((l, i) => i === 0
      ? x(l)
      : `</w:t></w:r><w:r><w:br/></w:r><w:r>${noB}<w:t xml:space="preserve">${x(l)}`
    ).join('');
  };

  // Inject the fields the template has no placeholder for FIRST, while their
  // anchor sections still exist — the removal pass below may delete some of them.
  if (Array.isArray(payload.extras) && payload.extras.length) {
    docXml = insertBriefExtras(docXml, payload.extras, toDocx);
  }

  // Drop any section whose field is empty/unchecked — remove its header AND its
  // value paragraph so the brief shows ONLY the fields that are toggled on and
  // have content (no more empty "הסעה"/"חנייה" headers).
  const OPTIONAL_SECTIONS = {
    '{{VENUE}}':              payload.venue,
    '{{ADDRESS}}':            payload.address,
    '{{TECHNICA_CREW}}':      payload.technicalCrew,
    '{{TRANSPORTATION}}':     payload.transportation,
    '{{PARKING}}':            payload.parking,
    '{{SCHEDULE}}':           payload.schedule,
    '{{CONTACTS}}':           payload.contacts,
    '{{ADDITIONAL_DETAILS}}': payload.additionalDetails,
  };
  for (const [ph, val] of Object.entries(OPTIONAL_SECTIONS)) {
    if (!val || !String(val).trim()) docXml = removeBriefSection(docXml, ph);
  }

  const map = {
    '{{EVENT_NAME}}':         toDocx(payload.eventName),
    '{{DATE}}':               toDocx(payload.date),
    '{{VENUE}}':              toDocx(payload.venue),
    '{{ADDRESS}}':            toDocx(payload.address),
    '{{TECHNICA_CREW}}':      toDocx(payload.technicalCrew),
    '{{TRANSPORTATION}}':     toDocx(payload.transportation),
    '{{PARKING}}':            toDocx(payload.parking),
    '{{SCHEDULE}}':           toDocx(payload.schedule),
    '{{CONTACTS}}':           toDocx(payload.contacts),
    '{{ADDITIONAL_DETAILS}}': toDocx(payload.additionalDetails),
  };
  for (const [ph, val] of Object.entries(map)) {
    docXml = docXml.split(ph).join(val);
  }

  zip.updateFile('word/document.xml', Buffer.from(docXml, 'utf8'));
  const docxBuffer = zip.toBuffer();

  // ── 2. Upload DOCX → Drive auto-converts to Google Doc ───────────────────
  const title = `דף תיאום ${payload.eventName} ${payload.date}`;

  const uploadRes = await drive.files.create({
    requestBody: {
      name:     title,
      mimeType: 'application/vnd.google-apps.document',
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body:     Readable.from(docxBuffer),
    },
    fields: 'id',
  });
  const docId = uploadRes.data.id;
  console.log(`[brief] Uploaded DOCX as Google Doc ${docId}`);

  // ── 3. Move to הפקות folder ──────────────────────────────────────────────
  try {
    const folderId = await getOrCreateHapakoFolder(drive);
    const fileInfo = await drive.files.get({ fileId: docId, fields: 'parents' });
    await drive.files.update({
      fileId: docId,
      addParents:    folderId,
      removeParents: (fileInfo.data.parents || []).join(','),
      fields: 'id,parents',
    });
  } catch (e) {
    console.error('[brief] Failed to move to הפקות folder (non-fatal):', e.message);
  }

  return `https://docs.google.com/document/d/${docId}/edit`;
}

// ── Shared helpers ───────────────────────────────────────────────────────────
// Reused in both the brief and PDF routes — no more duplication.
function formatShowDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
}
function showFieldInPdf(show, key) {
  if (key.startsWith('check_')) return show.pdfFields?.[key] === true;
  return !show.pdfFields || show.pdfFields[key] !== false;
}

// Transport: the structured fields (transportMode / transportDriver /
// transportTime) are the source of truth. The free-text `transportation` is a
// legacy duplicate, kept only as a fallback for older shows that have text but
// no structured values, so nothing already written disappears.
function transportText(show) {
  const parts = [];
  if (show.transportMode)   parts.push(show.transportMode);
  if (show.transportDriver) parts.push(`נהג: ${show.transportDriver}`);
  if (show.transportTime)   parts.push(show.transportTime);
  return parts.length ? parts.join(' — ') : (show.transportation || '');
}

// crewIds is the real link; technicalCrew is a denormalised text copy of it that
// the brief and PDF fall back to when no crew is assigned. Nothing kept the two
// in step, so swapping a sound engineer updated crewIds and left the old name in
// technicalCrew — 11 of 20 shows had already drifted this way, most listing
// musicians who are no longer counted as technical crew.
//
// Rebuild the text from crewIds on every save so the stored copy can't go stale.
// When no crew is assigned the existing text is preserved: shows imported from
// the schedule carry a sound contact there and have nothing to derive from.
async function syncTechnicalCrew(userId, show) {
  try {
    if (!Array.isArray(show.crewIds) || show.crewIds.length === 0) return show;
    const crew = await readCrew(userId);
    const text = show.crewIds
      .map((id) => crew.find((m) => m.id === id))
      .filter((m) => m && !MUSICIAN_ROLES.has(m.role))
      .map((m) => `${m.role} – ${m.name}`)
      .join(' | ');
    if (!text || text === show.technicalCrew) return show;
    return { ...show, technicalCrew: text };
  } catch {
    return show;   // never block a save on this
  }
}

// Short artist tag inserted into the PDF filename. Artist records store Latin
// names ("Assaf Amdursky"), but the coordination sheets are filed in Hebrew —
// so map to a Hebrew tag, falling back to the artist's own name for anyone not
// listed. Override/extend via ARTIST_FILENAME_TAGS (JSON: {"<artistId>":"תג"}).
const ARTIST_TAG_BY_NAME = { 'assaf amdursky': 'אמדורסקי', 'hila ruach': 'הילה רוח' };
function getArtistFilenameTag(userId) {
  try {
    const { artistId } = parseUserId(userId);
    if (!artistId) return '';
    const overrides = process.env.ARTIST_FILENAME_TAGS ? JSON.parse(process.env.ARTIST_FILENAME_TAGS) : {};
    if (overrides[artistId]) return overrides[artistId];
    const artists = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'artists.json'), 'utf8'));
    const artist = artists.find((a) => a.id === artistId);
    if (!artist?.name) return '';
    return ARTIST_TAG_BY_NAME[artist.name.trim().toLowerCase()] || artist.name;
  } catch {
    return '';
  }
}

// ── slimShow: strip heavy payloads for the list endpoint ─────────────────────
// Cuts payload 90%+ when stage-layout images are attached.
// Full data lives on disk and is returned by GET /:id (used for editing, PDF, brief).
// Also drops large free-text fields that are only needed in the detail view.
const SLIM_OMIT_FIELDS = new Set(['notes', 'additionalDetails']);
function slimShow(show) {
  const result = { ...show };
  // Strip large free-text fields not needed in card/list view
  for (const f of SLIM_OMIT_FIELDS) {
    if (result[f] && result[f].length > 200) delete result[f];
  }
  // Replace base64 customField data with a sentinel
  if (result.customFields) {
    const slim = {};
    for (const [k, v] of Object.entries(result.customFields)) {
      const src = typeof v === 'string' ? v : v?.data;
      if (typeof src === 'string' && src.startsWith('data:')) {
        slim[k] = typeof v === 'object' ? { ...v, data: null, _hasData: true } : { _hasData: true };
      } else {
        slim[k] = v;
      }
    }
    result.customFields = slim;
  }
  // Same treatment for anything carrying a base64 payload inside tasks[]. A real
  // task never does, but a stage-layout PDF ended up there on one older show, and
  // without this the list endpoint ships ~1.3MB to the browser on every load.
  // The data itself is untouched on disk and still served in full by GET /:id.
  if (Array.isArray(result.tasks)) {
    result.tasks = result.tasks.map((t) =>
      (t && typeof t.data === 'string' && t.data.startsWith('data:'))
        ? { ...t, data: null, _hasData: true }
        : t
    );
  }
  return result;
}

// ── Team-member field filter ─────────────────────────────────────────────────
// Strip sections that the admin has hidden from the team (visibleRubrics).
// 'core' fields (id, name, date, venue, eventType, crewIds) are always returned.
const RUBRIC_FIELDS = {
  schedule:  ['schedule'],
  logistics: ['transportation', 'parking', 'food', 'contacts'],
  technical: ['lightingCoordinated', 'soundCoordinated', 'rentalNeeds', 'rentalSupplier'],
  notes:     ['notes'],
  budget:    ['budget'],
};

function filterShowForTeamMember(show, visibleRubrics) {
  const allowed = new Set(['id', 'name', 'date', 'venue', 'eventType', 'type', 'crewIds', 'createdAt', 'customFields']);
  for (const rubric of visibleRubrics) {
    for (const field of RUBRIC_FIELDS[rubric] || []) allowed.add(field);
  }
  const result = {};
  for (const [k, v] of Object.entries(show)) {
    if (allowed.has(k)) result[k] = v;
  }
  return result;
}

// ─── CRUD routes ───────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    let shows = (await readShows(req.userId)).map(slimShow);
    if (req.teamMemberView) {
      shows = shows.map((s) => filterShowForTeamMember(s, req.visibleRubrics || []));
    }
    res.json(shows);
  } catch (err) { next(err); }
});

// GET /:id — full show data (used by ShowForm when editing)
router.get('/:id', async (req, res, next) => {
  try {
    const shows = await readShows(req.userId);
    const show = shows.find((s) => s.id === req.params.id);
    if (!show) return res.status(404).json({ error: 'Show not found' });
    // Team members get filtered view
    if (req.teamMemberView) {
      return res.json(filterShowForTeamMember(show, req.visibleRubrics || []));
    }
    res.json(show);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  if (req.teamMemberView) return res.status(403).json({ error: 'Read-only access' });
  try {
    const shows = await readShows(req.userId);
    const newShow = {
      id: uuidv4(),
      ...req.body,
      tasks: req.body.tasks || [],
      createdAt: new Date().toISOString(),
    };
    shows.push(newShow);
    await writeShows(req.userId, shows);
    res.status(201).json(newShow);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  if (req.teamMemberView) {
    const editRubrics = req.editableRubrics || [];
    if (editRubrics.length === 0) return res.status(403).json({ error: 'Read-only access' });
    // Partial update: only allow fields belonging to the user's editable rubrics
    try {
      const shows = await readShows(req.userId);
      const idx = shows.findIndex((s) => s.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Show not found' });
      const editableFields = new Set();
      for (const rubric of editRubrics) {
        for (const field of RUBRIC_FIELDS[rubric] || []) editableFields.add(field);
      }
      const partial = {};
      for (const [k, v] of Object.entries(req.body)) {
        if (editableFields.has(k)) partial[k] = v;
      }
      shows[idx] = { ...shows[idx], ...partial };
      await writeShows(req.userId, shows);
      return res.json(shows[idx]);
    } catch (err) { return next(err); }
  }
  try {
    const shows = await readShows(req.userId);
    const idx = shows.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Show not found' });
    const logFields = ['transportMode','transportDriver','transportTime','foodContactName','foodContactPhone','foodContactTime','soundCoordinated','lightingCoordinated','soundRentalNeeds','lightingRentalNeeds'];
    const changed = logFields.filter(f => req.body[f] !== undefined && req.body[f] !== shows[idx][f]);
    if (changed.length) console.log('[PUT show]', shows[idx].name, '— logistics changed:', changed.map(f => `${f}=${JSON.stringify(req.body[f])}`).join(', '));

    // Guard against the "slim show" data-loss pattern:
    // GET /api/shows returns slimShow() which replaces base64 customField data with
    // { data: null, _hasData: true }. If the client sends that back (e.g. from a quick
    // toggle action on a ShowCard), a naive shallow merge would permanently null out the
    // real file data. Restore it from the server record instead.
    const incoming = { ...req.body };
    if (incoming.customFields && shows[idx].customFields) {
      const restored = { ...incoming.customFields };
      for (const [k, v] of Object.entries(restored)) {
        if (v && v._hasData && !v.data && shows[idx].customFields[k]?.data) {
          restored[k] = shows[idx].customFields[k];
        }
      }
      incoming.customFields = restored;
    }

    shows[idx] = { ...shows[idx], ...incoming };
    shows[idx] = await syncTechnicalCrew(req.userId, shows[idx]);
    await writeShows(req.userId, shows);
    res.json(shows[idx]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  if (req.teamMemberView) return res.status(403).json({ error: 'Read-only access' });
  try {
    const shows = await readShows(req.userId);
    await writeShows(req.userId, shows.filter((s) => s.id !== req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/shows/apply-crew-templates
router.post('/apply-crew-templates', async (req, res, next) => {
  try {
    const [templates, crew, shows] = await Promise.all([
      readTemplates(req.userId),
      readCrew(req.userId),
      readShows(req.userId),
    ]);

    const buildCrewText = (ids) =>
      ids
        .map((id) => crew.find((m) => m.id === id))
        .filter((m) => m && m.role !== 'נגן')
        .map((m) => `${m.role} – ${m.name}`)
        .join(' | ');

    let updated = 0;
    const newShows = shows.map((s) => {
      if (s.archived) return s;
      const templateIds = templates[s.eventType];
      if (!templateIds || templateIds.length === 0) return s;
      updated++;
      return {
        ...s,
        crewIds: templateIds,
        technicalCrew: buildCrewText(templateIds),
      };
    });

    await writeShows(req.userId, newShows);
    res.json({ updated });
  } catch (err) { next(err); }
});

// ─── Brief (Google Docs creator) ───────────────────────────────────────────
// In-memory job store — keyed by jobId, auto-cleans after 10 min.
const briefJobs = new Map();

// GET /:id/brief/:jobId — poll brief generation status
router.get('/:id/brief/:jobId', (req, res) => {
  const job = briefJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found or expired' });
  res.json(job);
});

// POST /:id/brief — returns { jobId } immediately; actual work runs in background.
// Poll GET /:id/brief/:jobId until status === 'done' | 'error'.
router.post('/:id/brief', async (req, res) => {
  try {
    // Fast synchronous reads (cached) + credential check — all happen before we respond
    const shows = await readShows(req.userId);
    const show = shows.find((s) => s.id === req.params.id);
    if (!show) return res.status(404).json({ error: 'Show not found' });

    const [crew, fieldTemplates] = await Promise.all([readCrew(req.userId), readFieldTemplates(req.userId)]);

    const hasEnvCreds    = !!(process.env.GMAIL_CREDENTIALS && process.env.GMAIL_TOKEN);
    const hasVolumeCreds = fs.existsSync(path.join(DATA_DIR, 'gmail-credentials.json')) &&
                           fs.existsSync(path.join(DATA_DIR, 'gmail-token.json'));
    let hasFileCreds = false;
    if (!hasEnvCreds && !hasVolumeCreds) {
      try { await fsp.access(CREDENTIALS_PATH); await fsp.access(TOKEN_PATH); hasFileCreds = true; }
      catch { /* no file creds */ }
    }
    if (!isServiceAccountConfigured() && !hasEnvCreds && !hasVolumeCreds && !hasFileCreds) {
      return res.status(503).json({ error: 'Google Drive credentials not configured.' });
    }

    // Build everything that doesn't require I/O synchronously
    const inPdf   = (key) => showFieldInPdf(show, key);
    const customDefs = (show.eventType && fieldTemplates[show.eventType]) || [];

    const assignedCrew = (show.crewIds || []).map((id) => crew.find((m) => m.id === id)).filter(Boolean);
    // Technical crew = everyone assigned who isn't a musician (so backliner,
    // sound, lighting, production… all appear — consistent with the PDF).
    const techCrew  = assignedCrew.filter((m) => !MUSICIAN_ROLES.has(m.role)).map((m) => `${m.role} – ${m.name}`).join(' | ') || show.technicalCrew || '';
    const musicians = assignedCrew.filter((m) => MUSICIAN_ROLES.has(m.role)).map((m) => m.name).join(', ');

    const checkItems = [
      { key: 'check_mirror',       label: 'מראת גוף',   value: show.mirror },
      { key: 'check_coffeeCorner', label: 'פינת קפה',   value: show.coffeeCorner },
      { key: 'check_waterBottles', label: 'בקבוקי מים', value: show.waterBottles },
      ...(show.eventType === 'אני גיטרה' ? [{ key: 'check_piano', label: 'פסנתר', value: show.piano }] : []),
    ]
      .filter((item) => inPdf(item.key))
      .map((item) => `${item.label} ${item.value ? '✓' : '✕'}`)
      .join('\n');

    const customFieldsText = customDefs
      .filter((def) => def.type === 'image' ? show.pdfFields?.['cf_' + def.id] !== false : show.pdfFields?.['cf_' + def.id] === true)
      .map((def) => {
        const val = show.customFields?.[def.id];
        if (!val && val !== false) return '';
        if (def.type === 'image' || def.type === 'file') return '';
        if (def.type === 'checkbox') return `${def.label}: ${val ? 'כן' : 'לא'}`;
        return `${def.label}: ${val}`;
      })
      .filter(Boolean)
      .join('\n');

    // The brief must carry exactly what the PDF carries, driven by the same
    // per-field toggles. The template only has placeholders for some of these;
    // the rest are injected as new sections in createBriefDoc (see extras).
    const musiciansText = inPdf('musicians') ? musicians : '';
    const extraDetails  = [
      inPdf('additionalDetails') ? (show.additionalDetails || '') : '',
      checkItems,
      customFieldsText,
    ].filter(Boolean).join('\n');

    const basePayload = {
      eventName:         show.name,
      date:              formatShowDate(show.date),
      venue:             inPdf('venue')             ? (show.venue             || '') : '',
      address:           inPdf('address')           ? (show.address           || '') : '',
      parking:           inPdf('parking')           ? (show.parking           || '') : '',
      technicalCrew:     inPdf('technicalCrew')     ? techCrew                       : '',
      transportation:    inPdf('transportation')    ? transportText(show)            : '',
      schedule:          inPdf('schedule')          ? scheduleToString(show.schedule) : '',
      contacts:          inPdf('contacts')          ? (show.contacts          || '') : '',
      additionalDetails: extraDetails,
      // Sections the template has no placeholder for — injected so the brief
      // matches the PDF. Each is { after, label, value }: `after` is the
      // placeholder whose section it should follow, keeping the PDF's order.
      // אוכל and הערות are deliberately not on the brief — they stay on the PDF.
      extras: [
        { after: '{{DATE}}',          label: 'סוג אירוע',  value: show.eventType || '' },
        { after: '{{TECHNICA_CREW}}', label: 'הרכב נגנים', value: musiciansText },
      ].filter((e) => e.value && String(e.value).trim()),
    };

    // ── Respond immediately with jobId ─────────────────────────────────────
    const jobId = uuidv4();
    briefJobs.set(jobId, { status: 'processing', createdAt: Date.now() });
    res.json({ jobId, status: 'processing' });

    // ── Background: fill DOCX template + upload to Drive ─────────────────
    (async () => {
      try {
        const docUrl = await createBriefDoc(basePayload);
        briefJobs.set(jobId, { status: 'done', docUrl });
        console.log(`[brief] Job ${jobId} done: ${docUrl}`);
      } catch (err) {
        console.error(`[brief] Job ${jobId} failed:`, err.message);
        briefJobs.set(jobId, { status: 'error', error: err.message });
      } finally {
        setTimeout(() => briefJobs.delete(jobId), 10 * 60 * 1000);
      }
    })();

  } catch (err) {
    console.error('[brief] Setup failed:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Brief setup failed', details: err.message });
  }
});

// ─── PDF generation (refactored to puppeteer w/ cached browser) ────────────
router.post('/:id/pdf', async (req, res) => {
  try {
    const shows = await readShows(req.userId);
    const show = shows.find((s) => s.id === req.params.id);
    if (!show) return res.status(404).json({ error: 'Show not found' });

    const [crew, fieldTemplates] = await Promise.all([readCrew(req.userId), readFieldTemplates(req.userId)]);

    const assignedCrew = (show.crewIds || [])
      .map((id) => crew.find((m) => m.id === id))
      .filter(Boolean);
    const musicians = assignedCrew
      .filter((m) => MUSICIAN_ROLES.has(m.role))
      .map((m) => m.name)
      .join(', ');
    const techCrewText = assignedCrew
      .filter((m) => !MUSICIAN_ROLES.has(m.role))
      .map((m) => `${m.role} – ${m.name}`)
      .join(' | ');

    const esc   = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const nl2br = (s) => esc(s || '').replace(/\n/g, '<br>');
    const inPdf = (key) => showFieldInPdf(show, key);

    const customDefs = (show.eventType && fieldTemplates[show.eventType]) || [];
    const isPdfData = (v) => typeof v === 'string' && v.startsWith('data:application/pdf');
    const getImageSrc = (v) => (v && typeof v === 'object' ? v.data : v);

    // Build custom-field HTML. Images are separated so they can fill the
    // remaining page space at the bottom rather than being squeezed inline.
    const customFieldsTextParts = [];
    const customFieldsImgSrcs   = [];   // collect resolved image src strings

    for (const def of customDefs) {
      const isImage = def.type === 'image';
      const showIt  = isImage
        ? show.pdfFields?.['cf_' + def.id] !== false
        : show.pdfFields?.['cf_' + def.id] === true;
      if (!showIt) continue;

      const val = show.customFields?.[def.id];
      if (isImage && val) {
        const src = getImageSrc(val);
        if (isPdfData(src) || val?.isPdf) {
          const fname = typeof val === 'object' ? (val.name || 'קובץ PDF') : 'קובץ PDF';
          let pngSrc  = null;
          try {
            pngSrc = await pdfDataUrlToPng(typeof src === 'string' ? src : '');
          } catch (e) {
            console.error('[pdf] pdfDataUrlToPng threw:', e.message);
          }
          if (pngSrc) {
            customFieldsImgSrcs.push(pngSrc);
          } else {
            customFieldsTextParts.push(
              `<div class="row"><span class="label">${esc(def.label)}</span><span class="value">📎 ${esc(fname)}</span></div>`
            );
          }
        } else {
          customFieldsImgSrcs.push(src);
        }
      } else if (def.type === 'checkbox') {
        customFieldsTextParts.push(
          `<div class="row"><span class="label">${esc(def.label)}:</span><span class="value">${val ? '✓ כן' : '✕ לא'}</span></div>`
        );
      } else if (def.type === 'file' && val) {
        customFieldsTextParts.push(
          `<div class="row"><span class="label">${esc(def.label)}:</span><span class="value">📎 ${esc(val.name || 'קובץ מצורף')}</span></div>`
        );
      } else if (val) {
        customFieldsTextParts.push(
          `<div class="row"><span class="label">${esc(def.label)}:</span><span class="value">${nl2br(String(val))}</span></div>`
        );
      }
    }
    const customFieldsHtml = customFieldsTextParts.join('\n');
    // Image section: fills all remaining vertical space after text content,
    // image is centered and scales to fit without cropping.
    const imageSectionHtml = customFieldsImgSrcs.length > 0
      ? `<div class="img-fill">${customFieldsImgSrcs.map((s) => `<img src="${s}">`).join('')}</div>`
      : '';

    const checkItems = [
      { key: 'check_piano',        label: 'פסנתר',       value: show.piano,        condition: show.eventType === 'אני גיטרה' },
      { key: 'check_mirror',       label: 'מראת גוף',    value: show.mirror,       condition: true },
      { key: 'check_coffeeCorner', label: 'פינת קפה',    value: show.coffeeCorner, condition: true },
      { key: 'check_waterBottles', label: 'בקבוקי מים',  value: show.waterBottles, condition: true },
    ]
      .filter((item) => item.condition && show.pdfFields?.[item.key] === true)
      .map((item) => {
        const tick = item.value ? '✓' : '✕';
        const color = item.value ? '#2e7d32' : '#c62828';
        // RTL flex: first child → right side, second child → left side
        // So label first (right) then tick (left) → tick visually to the LEFT of the label
        return `<div class="check-row"><span class="check-lbl">${esc(item.label)}</span><span class="check-tick" style="color:${color}">${tick}</span></div>`;
      })
      .join('<div class="check-sep"></div>');

    const additionalContent = [
      (inPdf('additionalDetails') && show.additionalDetails) ? `<p style="line-height:1.6;margin-bottom:8px">${nl2br(show.additionalDetails)}</p>` : '',
      checkItems,
      customFieldsHtml,
    ].filter(Boolean).join('\n');

    const additionalSection = additionalContent
      ? `<h2>פרטים נוספים</h2>${additionalContent}`
      : '';

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  ${getHeeboDataUrl() ? `@font-face {
    font-family: 'Heebo';
    font-weight: 100 900;
    font-style: normal;
    src: url('${getHeeboDataUrl()}') format('truetype');
  }` : ''}
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  /* Flex column so .img-fill can claim remaining space after all text */
  html, body { height: 297mm; }
  body {
    font-family: 'Heebo', Arial, Helvetica, sans-serif; font-size: 11pt;
    color: #1a1a1a; direction: rtl;
    padding: 2cm 2.5cm;
    display: flex; flex-direction: column;
  }
  .page-content { flex: 0 0 auto; }
  /* Image fills whatever vertical space is left, centered on the page */
  .img-fill {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding-top: 14px;
  }
  .img-fill img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }
  h1 { font-size: 17pt; text-align: center; border-bottom: 2px solid #3E6B8E; padding-bottom: 10px; margin-bottom: 20px; color: #2D3142; }
  h2 { font-size: 13pt; color: #3E6B8E; border-bottom: 1px solid #d0d4dc; padding-bottom: 4px; margin: 20px 0 10px; }
  .row { display: flex; gap: 8px; margin-bottom: 6px; }
  .label { font-weight: bold; white-space: nowrap; min-width: 120px; }
  .value { color: #333; }
  .schedule { white-space: pre-wrap; background: #f7f8fa; border: 1px solid #e2e4e9; border-radius: 4px; padding: 10px; line-height: 1.6; }
  .musicians { background: #eef3f8; border-right: 3px solid #3E6B8E; padding: 8px 12px; border-radius: 0 4px 4px 0; margin-top: 8px; }
  /* Check items: RTL flex → first child on right (label), second child on left (✓/✕) */
  .check-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
  .check-lbl  { font-weight: 600; color: #222; }
  .check-tick { font-size: 13pt; font-weight: bold; }
  .check-sep  { height: 1px; background: #dde0e8; margin: 2px 0; }
</style>
</head>
<body>
<div class="page-content">
<h1>דף תיאום — ${esc(show.name)}</h1>

<h2>פרטי האירוע</h2>
${show.date ? `<div class="row"><span class="label">תאריך:</span><span class="value">${formatShowDate(show.date)}</span></div>` : ''}
${show.eventType ? `<div class="row"><span class="label">סוג אירוע:</span><span class="value">${esc(show.eventType)}</span></div>` : ''}
${inPdf('venue') && show.venue ? `<div class="row"><span class="label">מקום:</span><span class="value">${esc(show.venue)}</span></div>` : ''}
${inPdf('address') && show.address ? `<div class="row"><span class="label">כתובת:</span><span class="value">${esc(show.address)}</span></div>` : ''}
${inPdf('parking') && show.parking ? `<div class="row"><span class="label">חניה:</span><span class="value">${esc(show.parking)}</span></div>` : ''}

${inPdf('technicalCrew') && (techCrewText || show.technicalCrew) ? `<div class="row"><span class="label">צוות טכני:</span><span class="value">${esc(techCrewText || show.technicalCrew)}</span></div>` : ''}
${inPdf('transportation') && transportText(show) ? `<div class="row"><span class="label">הסעה:</span><span class="value">${esc(transportText(show))}</span></div>` : ''}
${inPdf('contacts') && show.contacts ? `<div class="row"><span class="label">אנשי קשר:</span><span class="value">${esc(show.contacts)}</span></div>` : ''}
${(show.pdfFields?.musicians !== false) && musicians ? `<div class="musicians"><span class="label">הרכב נגנים: </span>${esc(musicians)}</div>` : ''}

${inPdf('schedule') && show.schedule ? `<h2>לוז</h2><div class="schedule">${nl2br(scheduleToString(show.schedule))}</div>` : ''}

${additionalSection}

</div>
${imageSectionHtml}
</body>
</html>`;

    const dateStr = formatShowDate(show.date);
    const safeName = show.name.replace(/[/\\:*?"<>|]/g, '_');
    // Filename carries the artist tag right after "דף תיאום - ", e.g.
    // "דף תיאום - אמדורסקי סולו מועדון הג'ורג' ת״א 13.8.2026.pdf"
    const artistTag = getArtistFilenameTag(req.userId);
    const filename = `דף תיאום - ${artistTag ? artistTag + ' ' : ''}${safeName}${dateStr ? ' ' + dateStr : ''}.pdf`;

    // Render to a Buffer using the cached Puppeteer browser.
    const pdfBuffer = await htmlToPdfBuffer(html);

    // In local mode also save a copy to disk; in both modes stream the PDF
    // back to the browser so the download dialog always appears.
    if (PDF_DIR) {
      await fsp.mkdir(PDF_DIR, { recursive: true });
      const outputPath = path.join(PDF_DIR, filename);
      await fsp.writeFile(outputPath, pdfBuffer).catch(() => {});
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('[pdf] generation failed:', err.message);
    res.status(500).json({ error: 'PDF generation failed', details: err.message });
  }
});

module.exports = router;
module.exports.slimShow = slimShow;

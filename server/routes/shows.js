const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, execFileSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '../data/gmail-credentials.json');
const TOKEN_PATH       = path.join(__dirname, '../data/gmail-token.json');

function getGoogleAuth() {
  const creds  = process.env.GMAIL_CREDENTIALS
    ? JSON.parse(process.env.GMAIL_CREDENTIALS)
    : JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const tokens = process.env.GMAIL_TOKEN
    ? JSON.parse(process.env.GMAIL_TOKEN)
    : JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials(tokens);
  return client;
}

// Upload a data-URL to Google Drive, make it publicly readable, return a direct view URL.
async function uploadDataUrlToDrive(dataUrl, filename) {
  const auth  = getGoogleAuth();
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
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

// Convert a PDF data-URL to a PNG data-URL (first page only).
// macOS: sips  |  Linux: pdftoppm (poppler-utils)
function pdfDataUrlToPng(pdfDataUrl) {
  try {
    const base64 = pdfDataUrl.split(',')[1];
    if (!base64) return null;
    const stamp      = Date.now();
    const tmpPdf     = path.join(os.tmpdir(), `hub-pdf-${stamp}.pdf`);
    const tmpPngBase = path.join(os.tmpdir(), `hub-pdf-${stamp}`);
    fs.writeFileSync(tmpPdf, Buffer.from(base64, 'base64'));

    let pngB64;
    if (process.platform === 'darwin') {
      const tmpPng = tmpPngBase + '.png';
      execFileSync('sips', ['-s', 'format', 'png', tmpPdf, '--out', tmpPng], { timeout: 15000 });
      pngB64 = fs.readFileSync(tmpPng).toString('base64');
      try { fs.unlinkSync(tmpPng); } catch {}
    } else {
      // Linux: pdftoppm outputs <base>-1.png (single page)
      execFileSync('pdftoppm', ['-png', '-singlefile', '-r', '150', tmpPdf, tmpPngBase], { timeout: 15000 });
      const tmpPng = tmpPngBase + '.png';
      pngB64 = fs.readFileSync(tmpPng).toString('base64');
      try { fs.unlinkSync(tmpPng); } catch {}
    }
    try { fs.unlinkSync(tmpPdf); } catch {}
    return `data:image/png;base64,${pngB64}`;
  } catch {
    return null;
  }
}

const CREW_FILE = path.join(__dirname, '../data/crew.json');
// PDF_DIR: on cloud, set PDF_DIR='' or leave unset → PDF is streamed back as a download
const PDF_DIR = process.env.PDF_DIR !== undefined
  ? process.env.PDF_DIR
  : '/Users/zlilmargalit/Desktop/Production/דפי תיאום';
// Chrome path: override with CHROME_PATH env var for Linux
const CHROME = process.env.CHROME_PATH || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome'
);
const TEMPLATE_DOC_ID = process.env.TEMPLATE_DOC_ID || '1ZBXxhG14W91wBKdvW96Qu8-kQmIX2ZpNY58psVsqhDs';

// Find-or-create the "הפקות" folder in Drive; returns its ID.
async function getOrCreateHapakoFolder(drive) {
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and name='הפקות' and trashed=false",
    fields: 'files(id)',
    pageSize: 1,
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  // Create it
  const created = await drive.files.create({
    requestBody: { name: 'הפקות', mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.data.id;
}

// Create a coordination-sheet Google Doc by copying the template, replacing placeholders, and inserting image.
async function createBriefDoc(payload, imageUrl) {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const docs  = google.docs({ version: 'v1', auth });

  // Copy template
  const title = `דף תיאום ${payload.eventName} ${payload.date}`;
  const copyRes = await drive.files.copy({
    fileId: TEMPLATE_DOC_ID,
    requestBody: { name: title },
  });
  const docId = copyRes.data.id;

  // Hardcoded replacement map — covers body + header placeholders.
  // Dynamic detection misses header-section placeholders ({{DATE}}, {{VENUE}}, {{ADDRESS}}).
  const replacements = {
    '{{DATE}}':               payload.date             || '',
    '{{VENUE}}':              payload.venue            || '',
    '{{ADDRESS}}':            payload.address          || '',
    '{{EVENT_NAME}}':         payload.eventName        || '',
    '{{CREW_LIST}}':          payload.technicalCrew    || '',
    '{{PARKING}}':            payload.parking          || '',
    '{{SCHEDULE}}':           payload.schedule         || '',
    '{{CONTACTS}}':           payload.contacts         || '',
    '{{ADDITIONAL_DETAILS}}': payload.additionalDetails|| '',
    '{{checkItems}}':         payload.checkItems       || '',
    '{{customFields}}':       payload.customFields     || '',
    '{{musicians}}':          payload.musicians        || '',
    '{{venueContact}}':       payload.venueContact     || '',
    '{{food}}':               payload.food             || '',
    '{{notes}}':              payload.notes            || '',
    '{{transportation}}':     payload.transportation   || '',
    '{{sound}}':              payload.sound            || '',
    '{{lighting}}':           payload.lighting         || '',
    '{{backline}}':           payload.backline         || '',
  };

  const replaceRequests = Object.entries(replacements).map(([find, replace]) => ({
    replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace },
  }));

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: replaceRequests } });

  // Insert stage-layout image:
  //   1. Delete trailing empty paragraphs (the template's blank placeholder area)
  //      so the full page height is available for the image.
  //   2. Measure the space remaining below the last text line (text-only PDF export).
  //   3. Binary-search for the LARGEST image height that keeps the brief to 1 page.
  //   4. Center the image: horizontally (alignment=CENTER) and vertically
  //      (spaceAbove = half of the unused space above/below the image).
  if (imageUrl) {
    const RATIO = 360 / 252; // stage-layout aspect ratio
    const MAX_H = 400, MIN_H = 40; // raised ceiling now that blank lines are removed

    const countPdfPages = (buf) => {
      const s = Buffer.from(buf).toString('latin1');
      return Math.max(1, (s.match(/\/Type\s*\/Page[^s]/g) || []).length);
    };

    const findLastImageIdx = (docData) => {
      for (const el of [...(docData.body?.content || [])].reverse()) {
        if (el.paragraph) {
          for (const pEl of [...(el.paragraph.elements || [])].reverse()) {
            if (pEl.inlineObjectElement) return pEl.startIndex;
          }
        }
      }
      return -1;
    };

    const doInsert = (h) => docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: [{ insertInlineImage: {
        uri: imageUrl, endOfSegmentLocation: { segmentId: '' },
        objectSize: {
          width:  { magnitude: Math.min(Math.round(h * RATIO), 450), unit: 'PT' },
          height: { magnitude: h, unit: 'PT' },
        },
      }}] },
    });

    const doDelete = async () => {
      const data = (await docs.documents.get({ documentId: docId })).data;
      const idx = findLastImageIdx(data);
      if (idx < 0) return;
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: [{ deleteContentRange: { range: { startIndex: idx, endIndex: idx + 1 } } }] },
      });
    };

    const exportPages = async () => countPdfPages(
      (await drive.files.export(
        { fileId: docId, mimeType: 'application/pdf' },
        { responseType: 'arraybuffer' }
      )).data
    );

    try {
      // ── 1. Remove trailing empty paragraphs ────────────────────────────────
      const preDoc = (await docs.documents.get({ documentId: docId })).data;
      const bodyEls = preDoc.body?.content || [];
      const trailingEmpties = [];
      for (let i = bodyEls.length - 1; i >= 0; i--) {
        const el = bodyEls[i];
        if (!el.paragraph) break;
        const hasContent = (el.paragraph.elements || []).some(e =>
          e.inlineObjectElement || (e.textRun?.content || '').trim()
        );
        if (!hasContent) trailingEmpties.push({ startIndex: el.startIndex, endIndex: el.endIndex });
        else break;
      }
      if (trailingEmpties.length > 0) {
        trailingEmpties.sort((a, b) => b.startIndex - a.startIndex);
        await docs.documents.batchUpdate({
          documentId: docId,
          requestBody: { requests: trailingEmpties.map(r => ({ deleteContentRange: { range: r } })) },
        });
        console.log(`[brief] Cleared ${trailingEmpties.length} trailing blank paragraphs`);
      }

      // ── 2. Measure available vertical space (text-only PDF) ────────────────
      // Parse Tm operators from the PDF: "a b c d e f Tm" — f is the y-position.
      // The minimum y among all text lines is the bottom of the last content line.
      // Available space = lastTextY − bottom_margin (72pt = 1 inch).
      let availablePt = null;
      try {
        const textPdfStr = Buffer.from(
          (await drive.files.export(
            { fileId: docId, mimeType: 'application/pdf' },
            { responseType: 'arraybuffer' }
          )).data
        ).toString('latin1');
        const tmRe = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/g;
        let minY = Infinity, m;
        while ((m = tmRe.exec(textPdfStr)) !== null) {
          const y = parseFloat(m[6]);
          if (y > 80 && y < minY) minY = y; // ignore footer area (y ≤ 80)
        }
        if (minY < Infinity) {
          availablePt = Math.max(0, minY - 72); // space from last text line to bottom margin
          console.log(`[brief] Available for image: ~${Math.round(availablePt)}pt (lastTextY≈${Math.round(minY)})`);
        }
      } catch (_) { /* non-fatal */ }

      // ── 3. Binary-search for largest image height that keeps doc to 1 page ──
      let lo = MIN_H, hi = MAX_H, cur = MAX_H;
      await doInsert(cur);
      for (let i = 0; i < 5; i++) {
        const pages = await exportPages();
        if (pages <= 1) {
          lo = cur;
          if (hi - lo <= 15) break;
          const next = Math.round((lo + hi) / 2);
          if (next === cur) break;
          await doDelete(); cur = next; await doInsert(cur);
        } else {
          hi = cur - 1;
          if (hi < lo) { await doDelete(); cur = MIN_H; await doInsert(cur); break; }
          const next = Math.round((lo + hi) / 2);
          await doDelete(); cur = next; await doInsert(cur);
        }
      }
      console.log(`[brief] Final image height: ${cur}pt`);

      // ── 4. Center: horizontally (CENTER) + vertically (spaceAbove) ──────────
      const finalDoc = (await docs.documents.get({ documentId: docId })).data;
      let imgParaStart = -1, imgParaEnd = -1;
      for (const el of [...(finalDoc.body?.content || [])].reverse()) {
        if (el.paragraph && (el.paragraph.elements || []).some(e => e.inlineObjectElement)) {
          imgParaStart = el.startIndex;
          imgParaEnd   = el.endIndex;
          break;
        }
      }
      if (imgParaStart !== -1) {
        // spaceAbove = half the unused vertical gap so the image sits centred
        // in the rectangle between the last text line and the page bottom.
        const spaceAbove = (availablePt !== null && availablePt > cur)
          ? Math.max(8, Math.round((availablePt - cur) / 2))
          : 12; // fallback: small fixed gap

        await docs.documents.batchUpdate({
          documentId: docId,
          requestBody: {
            requests: [{
              updateParagraphStyle: {
                range: { startIndex: imgParaStart, endIndex: imgParaEnd },
                paragraphStyle: {
                  alignment: 'CENTER',
                  spaceAbove: { magnitude: spaceAbove, unit: 'PT' },
                },
                fields: 'alignment,spaceAbove',
              },
            }],
          },
        });
        console.log(`[brief] Image centered: spaceAbove=${spaceAbove}pt`);
      }
    } catch (e) {
      console.error('[brief] Image page-fit failed (non-fatal):', e.message);
    }
  }

  // Move document to "הפקות" folder (create it if needed)
  try {
    const folderId = await getOrCreateHapakoFolder(drive);
    const fileInfo = await drive.files.get({ fileId: docId, fields: 'parents' });
    await drive.files.update({
      fileId: docId,
      addParents: folderId,
      removeParents: (fileInfo.data.parents || []).join(','),
      fields: 'id,parents',
    });
  } catch (e) {
    console.error('[brief] Failed to move to הפקות folder:', e.message);
  }

  return `https://docs.google.com/document/d/${docId}/edit`;
}

const readCrew = () => {
  if (!fs.existsSync(CREW_FILE)) return [];
  return JSON.parse(fs.readFileSync(CREW_FILE, 'utf8'));
};

const DATA_FILE = path.join(__dirname, '../data/shows.json');
const FIELD_TEMPLATES_FILE = path.join(__dirname, '../data/field-templates.json');
const readFieldTemplates = () => {
  try { return JSON.parse(fs.readFileSync(FIELD_TEMPLATES_FILE, 'utf8')); } catch { return {}; }
};

const readShows = () => {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};

const writeShows = (shows) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(shows, null, 2));
};

router.get('/', (req, res) => {
  res.json(readShows());
});

router.post('/', (req, res) => {
  const shows = readShows();
  const newShow = {
    id: uuidv4(),
    ...req.body,
    tasks: req.body.tasks || [],
    createdAt: new Date().toISOString(),
  };
  shows.push(newShow);
  writeShows(shows);
  res.status(201).json(newShow);
});

router.put('/:id', (req, res) => {
  const shows = readShows();
  const idx = shows.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Show not found' });
  shows[idx] = { ...shows[idx], ...req.body };
  writeShows(shows);
  res.json(shows[idx]);
});

router.delete('/:id', (req, res) => {
  const shows = readShows();
  writeShows(shows.filter((s) => s.id !== req.params.id));
  res.status(204).send();
});

// POST /api/shows/apply-crew-templates
// For every active (non-archived) show that has an eventType with a template,
// auto-assign crewIds from the template and rebuild technicalCrew text.
router.post('/apply-crew-templates', (req, res) => {
  const TEMPLATES_FILE = path.join(__dirname, '../data/templates.json');
  let templates = {};
  try { templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8')); } catch { /* no templates yet */ }

  const crew = readCrew();
  const shows = readShows();

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

  writeShows(newShows);
  res.json({ updated });
});

const MAKE_WEBHOOK = 'https://hook.eu2.make.com/7avndcepy56go2862ofstmdymc2rth2k';

router.post('/:id/brief', async (req, res) => {
  const show = readShows().find((s) => s.id === req.params.id);
  if (!show) return res.status(404).json({ error: 'Show not found' });

  const crew = readCrew();
  const fieldTemplates = readFieldTemplates();

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
  };

  // Same toggle logic as ShowCard: check_ = default off, others = default on
  const inPdf = (key) => {
    if (key.startsWith('check_')) return show.pdfFields?.[key] === true;
    return !show.pdfFields || show.pdfFields[key] !== false;
  };

  // Build technical crew dynamically, excluding musicians
  const assignedCrew = (show.crewIds || []).map((id) => crew.find((m) => m.id === id)).filter(Boolean);
  const techCrew = assignedCrew
    .filter((m) => m.role !== 'נגן')
    .map((m) => `${m.role} – ${m.name}`)
    .join(' | ') || show.technicalCrew || '';
  const musicians = assignedCrew
    .filter((m) => m.role === 'נגן')
    .map((m) => m.name)
    .join(', ');

  // Custom fields — text/checkbox values; images uploaded to Drive for embedding
  const customDefs = (show.eventType && fieldTemplates[show.eventType]) || [];

  // Upload image/file custom fields to Google Drive and collect public URLs
  const imageUploadUrls = {}; // def.id → Drive URL
  const canUpload = fs.existsSync(CREDENTIALS_PATH) && fs.existsSync(TOKEN_PATH);
  if (canUpload) {
    for (const def of customDefs) {
      if (def.type !== 'image' && def.type !== 'file') continue;
      if (show.pdfFields?.['cf_' + def.id] === false) continue;
      const val = show.customFields?.[def.id];
      if (!val) continue;
      const dataUrl = typeof val === 'string' ? val : val.data;
      const origName = typeof val === 'object' ? (val.name || def.label) : def.label;
      if (!dataUrl) continue;
      try {
        const isPdf = (typeof val === 'object' && val.isPdf) ||
                      dataUrl.startsWith('data:application/pdf');
        const uploadUrl = isPdf ? pdfDataUrlToPng(dataUrl) : dataUrl;
        if (!uploadUrl) continue;
        const uploadName = origName.replace(/\.pdf$/i, '.png');
        imageUploadUrls[def.id] = await uploadDataUrlToDrive(uploadUrl, uploadName);
      } catch (e) {
        console.error('[brief] Drive upload failed for', def.label, e.message);
      }
    }
  }

  const customFieldsText = customDefs
    .filter((def) => {
      if (def.type === 'image') return show.pdfFields?.['cf_' + def.id] !== false;
      return show.pdfFields?.['cf_' + def.id] === true;
    })
    .map((def) => {
      const val = show.customFields?.[def.id];
      if (!val && val !== false) return '';
      if (def.type === 'image' || def.type === 'file') return '';
      if (def.type === 'checkbox') return `${def.label}: ${val ? 'כן' : 'לא'}`;
      return `${def.label}: ${val}`;
    })
    .filter(Boolean)
    .join('\n');

  // First image URL (for Make.com image insertion step)
  const firstImageUrl = Object.values(imageUploadUrls)[0] || '';

  // Check items (מראת גוף etc.) — only if PDF toggled on
  const checkItems = [
    { key: 'check_mirror',       label: 'מראת גוף',   value: show.mirror },
    { key: 'check_coffeeCorner', label: 'פינת קפה',   value: show.coffeeCorner },
    { key: 'check_waterBottles', label: 'בקבוקי מים', value: show.waterBottles },
    ...(show.eventType === 'אני גיטרה' ? [{ key: 'check_piano', label: 'פסנתר', value: show.piano }] : []),
  ]
    .filter((item) => inPdf(item.key))
    .map((item) => `${item.label}: ${item.value ? '✓' : '✕'}`)
    .join(' | ');

  const payload = {
    eventName:        show.name,
    date:             formatDate(show.date),
    venue:            inPdf('venue')            ? (show.venue            || '') : '',
    address:          inPdf('address')          ? (show.address          || '') : '',
    parking:          inPdf('parking')          ? (show.parking          || '') : '',
    technicalCrew:    inPdf('technicalCrew')    ? techCrew                      : '',
    musicians:        inPdf('musicians')        ? musicians                     : '',
    transportation:   inPdf('transportation')   ? (show.transportation   || '') : '',
    schedule:         inPdf('schedule')         ? (show.schedule         || '') : '',
    contacts:         inPdf('contacts')         ? (show.contacts         || '') : '',
    venueContact:     inPdf('venueContact')     ? (show.venueContact     || '') : '',
    additionalDetails:inPdf('additionalDetails')? (show.additionalDetails|| '') : '',
    food:             inPdf('food')             ? (show.food             || '') : '',
    notes:            inPdf('notes')            ? (show.notes            || '') : '',
    sound:            show.sound       || '',
    lighting:         show.lighting    || '',
    backline:         show.backline    || '',
    crewEmails:       (show.crewEmails || []).join(', '),
    customFields:          customFieldsText,
    checkItems:            checkItems,
    stageLayoutImageUrl:   firstImageUrl,
  };

  try {
    const docUrl = await createBriefDoc(payload, firstImageUrl);
    res.json({ success: true, docUrl });
  } catch (err) {
    console.error('[brief] Doc creation failed:', err.message);
    res.status(500).json({ error: 'Brief creation failed', details: err.message });
  }
});

router.post('/:id/pdf', async (req, res) => {
  const show = readShows().find((s) => s.id === req.params.id);
  if (!show) return res.status(404).json({ error: 'Show not found' });

  const crew = readCrew();
  const assignedCrew = (show.crewIds || [])
    .map((id) => crew.find((m) => m.id === id))
    .filter(Boolean);
  const musicians = assignedCrew
    .filter((m) => m.role === 'נגן')
    .map((m) => m.name)
    .join(', ');
  // Technical crew = everyone except musicians; built dynamically so musicians never bleed in
  const techCrewText = assignedCrew
    .filter((m) => m.role !== 'נגן')
    .map((m) => `${m.role} – ${m.name}`)
    .join(' | ');

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
  };

  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nl2br = (s) => esc(s || '').replace(/\n/g, '<br>');

  // pdfFields controls which standard fields appear (default: show all)
  const inPdf = (key) => !show.pdfFields || show.pdfFields[key] !== false;

  // Custom field templates for this event type
  const fieldTemplates = readFieldTemplates();
  const customDefs = (show.eventType && fieldTemplates[show.eventType]) || [];

  // Helper: is a stored image value actually a PDF?
  const isPdfData = (v) => typeof v === 'string' && v.startsWith('data:application/pdf');
  // Helper: get image src — handle both plain dataURL and {name,data} objects
  const getImageSrc = (v) => (v && typeof v === 'object' ? v.data : v);

  // No floating-top image — all custom fields (including images) appear in the body section.
  // Image-type fields are included by default (unless explicitly toggled off).
  // Other custom fields only appear when explicitly toggled on.
  const topImageHtml = ''; // no longer used — images go in the body

  const customFieldsHtml = customDefs
    .filter((def) => {
      if (def.type === 'image') return show.pdfFields?.['cf_' + def.id] !== false; // default: show
      return show.pdfFields?.['cf_' + def.id] === true; // other fields: default: hide
    })
    .map((def) => {
      const val = show.customFields?.[def.id];
      if (def.type === 'image' && val) {
        const src = getImageSrc(val);
        if (isPdfData(src) || val?.isPdf) {
          // Convert PDF → PNG so the first page appears visually in the sheet
          const pngSrc = pdfDataUrlToPng(typeof src === 'string' ? src : '');
          const fname  = typeof val === 'object' ? (val.name || 'קובץ PDF') : 'קובץ PDF';
          if (pngSrc) {
            return `<div class="row" style="flex-direction:column"><span class="label">${esc(def.label)}:</span><img src="${pngSrc}" style="max-width:100%;max-height:350px;border:1px solid #ddd;border-radius:4px;margin-top:6px;object-fit:contain"><span style="font-size:0.8em;color:#888;margin-top:3px">📎 ${esc(fname)}</span></div>`;
          }
          return `<div class="row"><span class="label">${esc(def.label)}:</span><span class="value">📎 ${esc(fname)}</span></div>`;
        }
        return `<div class="row" style="flex-direction:column"><span class="label">${esc(def.label)}:</span><img src="${src}" style="max-width:100%;max-height:280px;border:1px solid #ddd;border-radius:4px;margin-top:6px;object-fit:contain"></div>`;
      }
      if (def.type === 'checkbox') {
        return `<div class="row"><span class="label">${esc(def.label)}:</span><span class="value">${val ? '✓ כן' : '✕ לא'}</span></div>`;
      }
      if (def.type === 'file' && val) {
        return `<div class="row"><span class="label">${esc(def.label)}:</span><span class="value">📎 ${esc(val.name || 'קובץ מצורף')}</span></div>`;
      }
      if (val) {
        return `<div class="row"><span class="label">${esc(def.label)}:</span><span class="value">${nl2br(String(val))}</span></div>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');

  // Checkbox items — only rendered when their pdfFields key is explicitly true
  const checkItems = [
    { key: 'check_piano',        label: 'פסנתר',       value: show.piano,        condition: show.eventType === 'אני גיטרה' },
    { key: 'check_mirror',       label: 'מראת גוף',    value: show.mirror,       condition: true },
    { key: 'check_coffeeCorner', label: 'פינת קפה',    value: show.coffeeCorner, condition: true },
    { key: 'check_waterBottles', label: 'בקבוקי מים',  value: show.waterBottles, condition: true },
  ]
    .filter((item) => item.condition && show.pdfFields?.[item.key] === true)
    .map((item) => `<div class="row"><span class="label">${esc(item.label)}:</span><span class="value">${item.value ? '✓ כן' : '✕ לא'}</span></div>`)
    .join('\n');

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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1a1a1a; direction: rtl; padding: 2cm 2.5cm; }
  h1 { font-size: 17pt; text-align: center; border-bottom: 2px solid #3E6B8E; padding-bottom: 10px; margin-bottom: 20px; color: #2D3142; }
  h2 { font-size: 13pt; color: #3E6B8E; border-bottom: 1px solid #d0d4dc; padding-bottom: 4px; margin: 20px 0 10px; }
  .row { display: flex; gap: 8px; margin-bottom: 6px; }
  .label { font-weight: bold; white-space: nowrap; min-width: 120px; }
  .value { color: #333; }
  .schedule { white-space: pre-wrap; background: #f7f8fa; border: 1px solid #e2e4e9; border-radius: 4px; padding: 10px; line-height: 1.6; }
  .musicians { background: #eef3f8; border-right: 3px solid #3E6B8E; padding: 8px 12px; border-radius: 0 4px 4px 0; margin-top: 8px; }
  @media print { body { padding: 1.5cm 2cm; } }
</style>
</head>
<body>
${topImageHtml}
<h1>דף תיאום — ${esc(show.name)}</h1>

<h2>פרטי האירוע</h2>
${show.date ? `<div class="row"><span class="label">תאריך:</span><span class="value">${formatDate(show.date)}</span></div>` : ''}
${show.eventType ? `<div class="row"><span class="label">סוג אירוע:</span><span class="value">${esc(show.eventType)}</span></div>` : ''}
${inPdf('venue') && show.venue ? `<div class="row"><span class="label">מקום:</span><span class="value">${esc(show.venue)}</span></div>` : ''}
${inPdf('address') && show.address ? `<div class="row"><span class="label">כתובת:</span><span class="value">${esc(show.address)}</span></div>` : ''}
${inPdf('parking') && show.parking ? `<div class="row"><span class="label">חניה:</span><span class="value">${esc(show.parking)}</span></div>` : ''}
${inPdf('venueContact') && show.venueContact ? `<div class="row"><span class="label">איש קשר מקום:</span><span class="value">${esc(show.venueContact)}</span></div>` : ''}
${inPdf('technicalCrew') && (techCrewText || show.technicalCrew) ? `<div class="row"><span class="label">צוות טכני:</span><span class="value">${esc(techCrewText || show.technicalCrew)}</span></div>` : ''}
${inPdf('transportation') && show.transportation ? `<div class="row"><span class="label">הסעה:</span><span class="value">${esc(show.transportation)}</span></div>` : ''}
${inPdf('food') && show.food ? `<div class="row"><span class="label">אוכל:</span><span class="value">${esc(show.food)}</span></div>` : ''}
${inPdf('contacts') && show.contacts ? `<div class="row"><span class="label">אנשי קשר:</span><span class="value">${esc(show.contacts)}</span></div>` : ''}
${(show.pdfFields?.musicians !== false) && musicians ? `<div class="musicians"><span class="label">הרכב נגנים: </span>${esc(musicians)}</div>` : ''}

${inPdf('schedule') && show.schedule ? `<h2>לוז</h2><div class="schedule">${nl2br(show.schedule)}</div>` : ''}

${additionalSection}

${inPdf('notes') && show.notes ? `<h2>הערות</h2><p style="line-height:1.6">${nl2br(show.notes)}</p>` : ''}
</body>
</html>`;

  const tmpHtml = path.join(os.tmpdir(), `show-pdf-${show.id}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const dateStr = formatDate(show.date);
  const safeName = show.name.replace(/[/\\:*?"<>|]/g, '_');
  const filename = `אמדורסקי ${safeName}${dateStr ? ' ' + dateStr : ''}.pdf`;

  // Cloud mode (PDF_DIR is empty): save to tmp then stream as download
  // Local mode (PDF_DIR set): save directly to the target folder
  const cloudMode = !PDF_DIR;
  const outputPath = cloudMode
    ? path.join(os.tmpdir(), `show-pdf-out-${show.id}-${Date.now()}.pdf`)
    : path.join(PDF_DIR, filename);

  const args = [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    `--print-to-pdf=${outputPath}`,
    '--print-to-pdf-no-header',
    `file://${tmpHtml}`,
  ];

  try {
    await new Promise((resolve, reject) => {
      execFile(CHROME, args, { timeout: 30000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    try { fs.unlinkSync(tmpHtml); } catch {}

    if (cloudMode) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      stream.on('end', () => { try { fs.unlinkSync(outputPath); } catch {} });
    } else {
      res.json({ success: true, filename, path: outputPath });
    }
  } catch (err) {
    try { fs.unlinkSync(tmpHtml); } catch {}
    res.status(500).json({ error: 'PDF generation failed', details: err.message });
  }
});

module.exports = router;

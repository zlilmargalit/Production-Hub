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
const { dataPath, cacheKey } = require('../utils/userData');

const execFileP = promisify(execFile);

// ── Static paths (Google credentials remain global) ─────────────────────────
const CREDENTIALS_PATH = path.join(__dirname, '../data/gmail-credentials.json');
const TOKEN_PATH       = path.join(__dirname, '../data/gmail-token.json');

const PDF_DIR = process.env.PDF_DIR !== undefined
  ? process.env.PDF_DIR
  : '/Users/zlilmargalit/Desktop/Production/דפי תיאום';
const TEMPLATE_DOC_ID = process.env.TEMPLATE_DOC_ID || '1ZBXxhG14W91wBKdvW96Qu8-kQmIX2ZpNY58psVsqhDs';

// ── Per-user cached file readers ────────────────────────────────────────────
const readShows  = (uid) => readJsonCached(cacheKey(uid, 'shows'),          dataPath(uid, 'shows.json'),           []);
const writeShows = (uid, shows) => writeJsonAndCache(cacheKey(uid, 'shows'), dataPath(uid, 'shows.json'),          shows);
const readCrew   = (uid) => readJsonCached(cacheKey(uid, 'crew'),           dataPath(uid, 'crew.json'),            []);
const readFieldTemplates = (uid) => readJsonCached(cacheKey(uid, 'fieldTemplates'), dataPath(uid, 'field-templates.json'), {});
const readTemplates      = (uid) => readJsonCached(cacheKey(uid, 'templates'),      dataPath(uid, 'templates.json'),       {});

// ── Google auth (async-safe) ───────────────────────────────────────────────
async function getGoogleAuth() {
  const creds  = process.env.GMAIL_CREDENTIALS
    ? JSON.parse(process.env.GMAIL_CREDENTIALS)
    : JSON.parse(await fsp.readFile(CREDENTIALS_PATH, 'utf8'));
  const tokens = process.env.GMAIL_TOKEN
    ? JSON.parse(process.env.GMAIL_TOKEN)
    : JSON.parse(await fsp.readFile(TOKEN_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials(tokens);
  return client;
}

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

// Create a coordination-sheet Google Doc by copying the template, replacing
// placeholders, and inserting the stage layout image. (Unchanged behaviour
// from the previous version — just `await getGoogleAuth()` now.)
async function createBriefDoc(payload, imageUrl) {
  const auth = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const docs  = google.docs({ version: 'v1', auth });

  const title = `דף תיאום ${payload.eventName} ${payload.date}`;
  const copyRes = await drive.files.copy({
    fileId: TEMPLATE_DOC_ID,
    requestBody: { name: title },
  });
  const docId = copyRes.data.id;

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
    // Strip the colon from the "פרטים נוספים:" heading if the template has one
    'פרטים נוספים:':          'פרטים נוספים',
  };

  const replaceRequests = Object.entries(replacements).map(([find, replace]) => ({
    replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace },
  }));

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: replaceRequests } });

  if (imageUrl) {
    // ── Step 1: trim trailing blank paragraphs ────────────────────────────────
    try {
      const preDoc = (await docs.documents.get({ documentId: docId })).data;
      const bodyEls = preDoc.body?.content || [];
      const trailingEmpties = [];
      const lastParaIdx = [...bodyEls].reverse().findIndex(el => el.paragraph);
      const skipEndIdx  = lastParaIdx >= 0 ? bodyEls.length - 1 - lastParaIdx : -1;
      for (let i = bodyEls.length - 1; i >= 0; i--) {
        const el = bodyEls[i];
        if (!el.paragraph) break;
        if (i === skipEndIdx) continue;
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
    } catch (e) {
      console.warn('[brief] Trailing blank removal skipped (non-fatal):', e.message);
    }

    // ── Step 2: measure page geometry, find last body-text Y, insert at correct size ──
    try {
      const toPT = (dim) => {
        if (!dim) return null;
        const { magnitude: v, unit } = dim;
        if (unit === 'MM')   return v * 2.8346;
        if (unit === 'INCH') return v * 72;
        return v;
      };
      const countPdfPages = (buf) => {
        const s = Buffer.from(buf).toString('latin1');
        return Math.max(1, (s.match(/\/Type\s*\/Page[^s]/g) || []).length);
      };

      // ── Page geometry from document style ──
      const docMeta = (await docs.documents.get({ documentId: docId })).data;
      const ds = docMeta.documentStyle || {};
      const pageW   = toPT(ds.pageSize?.width)  || 595.28;
      const pageH   = toPT(ds.pageSize?.height) || 841.89;
      const marginB = toPT(ds.marginBottom) || 72;
      const marginL = toPT(ds.marginLeft)   || 72;
      const marginR = toPT(ds.marginRight)  || 72;
      const usableW = pageW - marginL - marginR;

      // ── Export text-only PDF; collect all Tm Y values ──
      const pdfBuf = Buffer.from(
        (await drive.files.export(
          { fileId: docId, mimeType: 'application/pdf' },
          { responseType: 'arraybuffer' }
        )).data
      );
      const pdfStr = pdfBuf.toString('latin1');

      const tmRe = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/g;
      const ySet = new Set();
      let mp;
      while ((mp = tmRe.exec(pdfStr)) !== null) {
        const y = parseFloat(mp[6]);
        if (y > marginB && y < pageH) ySet.add(Math.round(y));
      }

      // Sort descending (highest Y = top of page first).
      // Detect the first large gap (> 100 pt) — text below the gap is an isolated
      // element (footer / floating text box) and should be excluded.
      // "lastTextY" = the lowest BODY-text baseline above any such gap.
      const yVals = [...ySet].sort((a, b) => b - a);
      let lastTextY = null;
      if (yVals.length > 0) {
        lastTextY = yVals[yVals.length - 1]; // absolute minimum as fallback
        for (let i = 0; i < yVals.length - 1; i++) {
          if (yVals[i] - yVals[i + 1] > 100) {
            lastTextY = yVals[i]; // lowest body-text Y, above the gap
            break;
          }
        }
      }
      if (lastTextY === null) {
        lastTextY = pageH * 0.55; // fallback: assume content fills top 45%
        console.log('[brief] No text Y found; using fallback lastTextY');
      }
      console.log(`[brief] lastTextY=${Math.round(lastTextY)}pt  usableW=${Math.round(usableW)}pt`);

      // ── Available space below last body-text line ──
      // We'll fill ~92% of it so there's a small cushion at top & bottom.
      const available = lastTextY - marginB;
      const fillRatio = 0.92;
      const maxH = Math.max(40, Math.round(available * fillRatio));

      // ── Fetch actual image AR from Drive so sizing is exact ──
      let imgAR = null;
      const driveIdMatch = imageUrl.match(/[?&]id=([^&]+)/);
      if (driveIdMatch?.[1]) {
        try {
          const imgMeta = (await drive.files.get({
            fileId: driveIdMatch[1],
            fields: 'imageMediaMetadata',
          })).data;
          const { width: iW, height: iH } = imgMeta.imageMediaMetadata || {};
          if (iW && iH) { imgAR = iW / iH; console.log(`[brief] image AR=${imgAR.toFixed(2)}`); }
        } catch (_) { /* non-fatal */ }
      }

      // ── Compute display size within (usableW × maxH), maintaining AR ──
      let displayH, displayW;
      if (imgAR) {
        if (usableW / imgAR <= maxH) {
          // width-constrained
          displayW = Math.round(usableW);
          displayH = Math.round(usableW / imgAR);
        } else {
          // height-constrained
          displayH = maxH;
          displayW = Math.min(Math.round(maxH * imgAR), Math.round(usableW));
        }
      } else {
        // Unknown AR — give it the full bounding box and let Docs scale it
        displayH = maxH;
        displayW = Math.round(usableW);
      }
      displayH = Math.max(displayH, 40);
      displayW = Math.max(displayW, 40);

      // ── Vertical centering: distribute empty space equally above & below ──
      const spaceAbove = Math.max(8, Math.round((available - displayH) / 2));
      console.log(`[brief] available=${Math.round(available)}pt displayH=${displayH}pt spaceAbove=${spaceAbove}pt`);

      // ── Insert at computed size (single call — no loop) ──
      const insertResp = await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: [{ insertInlineImage: {
          uri: imageUrl,
          endOfSegmentLocation: { segmentId: '' },
          objectSize: {
            width:  { magnitude: displayW, unit: 'PT' },
            height: { magnitude: displayH, unit: 'PT' },
          },
        }}] },
      });
      const insertedObjId = insertResp.data.replies?.[0]?.insertInlineImage?.objectId || null;
      console.log(`[brief] Inserted image ${displayW}×${displayH}pt objId=${insertedObjId}`);

      // ── Safety check: if still > 1 page, shrink 25% ──
      if (insertedObjId) {
        const pageCount = countPdfPages(Buffer.from(
          (await drive.files.export(
            { fileId: docId, mimeType: 'application/pdf' },
            { responseType: 'arraybuffer' }
          )).data
        ));
        if (pageCount > 1) {
          const sh = Math.max(40, Math.round(displayH * 0.72));
          const sw = Math.max(40, Math.round(displayW * 0.72));
          await docs.documents.batchUpdate({
            documentId: docId,
            requestBody: { requests: [{ updateInlineObjectProperties: {
              objectId: insertedObjId,
              inlineObjectProperties: { embeddedObject: { size: {
                width:  { magnitude: sw, unit: 'PT' },
                height: { magnitude: sh, unit: 'PT' },
              }}},
              fields: 'embeddedObject.size',
            }}] },
          });
          console.log(`[brief] Safety shrink ${displayH}→${sh}pt`);
        }
      }

      // ── Center-align image paragraph; set spaceAbove for vertical centering ──
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
        await docs.documents.batchUpdate({
          documentId: docId,
          requestBody: { requests: [{
            updateParagraphStyle: {
              range: { startIndex: imgParaStart, endIndex: imgParaEnd },
              paragraphStyle: {
                alignment: 'CENTER',
                spaceAbove: { magnitude: spaceAbove, unit: 'PT' },
                spaceBelow: { magnitude: 0, unit: 'PT' },
              },
              fields: 'alignment,spaceAbove,spaceBelow',
            },
          }] },
        });
        console.log(`[brief] Centered: spaceAbove=${spaceAbove}pt`);
      }
    } catch (e) {
      console.error('[brief] Image insertion failed (non-fatal):', e.message);
    }
  }

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

// ─── CRUD routes ───────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    res.json(await readShows(req.userId));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
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
  try {
    const shows = await readShows(req.userId);
    const idx = shows.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Show not found' });
    shows[idx] = { ...shows[idx], ...req.body };
    await writeShows(req.userId, shows);
    res.json(shows[idx]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
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
router.post('/:id/brief', async (req, res) => {
  try {
    const shows = await readShows(req.userId);
    const show = shows.find((s) => s.id === req.params.id);
    if (!show) return res.status(404).json({ error: 'Show not found' });

    const [crew, fieldTemplates] = await Promise.all([readCrew(req.userId), readFieldTemplates(req.userId)]);

    const formatDate = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
    };

    const inPdf = (key) => {
      if (key.startsWith('check_')) return show.pdfFields?.[key] === true;
      return !show.pdfFields || show.pdfFields[key] !== false;
    };

    const assignedCrew = (show.crewIds || []).map((id) => crew.find((m) => m.id === id)).filter(Boolean);
    const techCrew = assignedCrew
      .filter((m) => m.role !== 'נגן')
      .map((m) => `${m.role} – ${m.name}`)
      .join(' | ') || show.technicalCrew || '';
    const musicians = assignedCrew
      .filter((m) => m.role === 'נגן')
      .map((m) => m.name)
      .join(', ');

    const customDefs = (show.eventType && fieldTemplates[show.eventType]) || [];

    // Check whether Google credentials are available (env vars take priority over files).
    const hasEnvCreds = !!(process.env.GMAIL_CREDENTIALS && process.env.GMAIL_TOKEN);
    let hasFileCreds = false;
    if (!hasEnvCreds) {
      try {
        await fsp.access(CREDENTIALS_PATH);
        await fsp.access(TOKEN_PATH);
        hasFileCreds = true;
      } catch { /* no file creds */ }
    }
    const canUpload = hasEnvCreds || hasFileCreds;

    if (!canUpload) {
      return res.status(503).json({
        error: 'Google Drive credentials not configured. Set GMAIL_CREDENTIALS and GMAIL_TOKEN environment variables to enable Brief creation.',
      });
    }

    const imageUploadUrls = {};

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
          const uploadUrl = isPdf ? await pdfDataUrlToPng(dataUrl) : dataUrl;
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

    const firstImageUrl = Object.values(imageUploadUrls)[0] || '';

    const checkItems = [
      { key: 'check_mirror',       label: 'מראת גוף',   value: show.mirror },
      { key: 'check_coffeeCorner', label: 'פינת קפה',   value: show.coffeeCorner },
      { key: 'check_waterBottles', label: 'בקבוקי מים', value: show.waterBottles },
      ...(show.eventType === 'אני גיטרה' ? [{ key: 'check_piano', label: 'פסנתר', value: show.piano }] : []),
    ]
      .filter((item) => inPdf(item.key))
      // Label first, then ✓/✕ — in RTL Google Docs the tick ends up on the LEFT of the label
      .map((item) => `${item.label} ${item.value ? '✓' : '✕'}`)
      .join('\n');

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

    const docUrl = await createBriefDoc(payload, firstImageUrl);
    res.json({ success: true, docUrl });
  } catch (err) {
    console.error('[brief] Doc creation failed:', err.message);
    res.status(500).json({ error: 'Brief creation failed', details: err.message });
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
      .filter((m) => m.role === 'נגן')
      .map((m) => m.name)
      .join(', ');
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
    const inPdf = (key) => !show.pdfFields || show.pdfFields[key] !== false;

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
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  /* Flex column so .img-fill can claim remaining space after all text */
  html, body { height: 297mm; }
  body {
    font-family: Arial, Helvetica, sans-serif; font-size: 11pt;
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
</div>
${imageSectionHtml}
</body>
</html>`;

    const dateStr = formatDate(show.date);
    const safeName = show.name.replace(/[/\\:*?"<>|]/g, '_');
    const filename = `אמדורסקי ${safeName}${dateStr ? ' ' + dateStr : ''}.pdf`;

    // Render to a Buffer using the cached Puppeteer browser.
    const pdfBuffer = await htmlToPdfBuffer(html);

    const cloudMode = !PDF_DIR;
    if (cloudMode) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      return res.end(pdfBuffer);
    }

    const outputPath = path.join(PDF_DIR, filename);
    await fsp.writeFile(outputPath, pdfBuffer);
    res.json({ success: true, filename, path: outputPath });
  } catch (err) {
    console.error('[pdf] generation failed:', err.message);
    res.status(500).json({ error: 'PDF generation failed', details: err.message });
  }
});

module.exports = router;

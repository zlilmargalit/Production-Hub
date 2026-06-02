const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const fsp     = require('fs').promises;
const path    = require('path');
const { google } = require('googleapis');

const { readJsonCached } = require('../cache');
const { dataPath, cacheKey, DATA_DIR } = require('../utils/userData');

// Local-dev credential fallback paths
const CREDENTIALS_PATH  = path.join(__dirname, '../data/gmail-credentials.json');
const TOKEN_PATH        = path.join(__dirname, '../data/gmail-token.json');

// Template Google Doc ID — override via BRIEF_TEMPLATE_ID or TEMPLATE_DOC_ID env var
const BRIEF_TEMPLATE_ID = process.env.BRIEF_TEMPLATE_ID
  || process.env.TEMPLATE_DOC_ID
  || '1ZBXxhG14W91wBKdvW96Qu8-kQmIX2ZpNY58psVsqhDs';

// Per-user show reader (multi-tenant)
const readShows = (uid) =>
  readJsonCached(cacheKey(uid, 'shows'), dataPath(uid, 'shows.json'), []);

// ── Google auth — same two-client pattern as shows.js ──────────────────────
// Priority: volume file > GMAIL_* env vars > local server/data/ files
async function getGoogleAuth() {
  const volumeCredsPath = path.join(DATA_DIR, 'gmail-credentials.json');
  const volumeTokenPath = path.join(DATA_DIR, 'gmail-token.json');

  let creds, tokens;

  if (fs.existsSync(volumeCredsPath)) {
    creds = JSON.parse(await fsp.readFile(volumeCredsPath, 'utf8'));
  } else if (process.env.GMAIL_CREDENTIALS) {
    creds = JSON.parse(process.env.GMAIL_CREDENTIALS);
  } else {
    creds = JSON.parse(await fsp.readFile(CREDENTIALS_PATH, 'utf8'));
  }

  if (fs.existsSync(volumeTokenPath)) {
    tokens = JSON.parse(await fsp.readFile(volumeTokenPath, 'utf8'));
  } else if (process.env.GMAIL_TOKEN) {
    tokens = JSON.parse(process.env.GMAIL_TOKEN);
  } else {
    tokens = JSON.parse(await fsp.readFile(TOKEN_PATH, 'utf8'));
  }

  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;

  // Step 1: full client with refresh_token — only used to obtain a fresh access_token
  const refreshClient = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  refreshClient.setCredentials(tokens);
  refreshClient.on('tokens', (newTokens) => {
    const dest   = path.join(DATA_DIR, 'gmail-token.json');
    const merged = { ...tokens, ...newTokens };
    fsp.writeFile(dest, JSON.stringify(merged, null, 2), 'utf8')
      .then(() => console.log('[documents/auth] token auto-refreshed and saved'))
      .catch((e) => console.warn('[documents/auth] could not save refreshed token:', e.message));
  });

  let accessToken = tokens.access_token;
  try {
    const result = await refreshClient.getAccessToken();
    if (result.token) accessToken = result.token;
  } catch (e) {
    console.warn('[documents/auth] getAccessToken failed, using stored token:', e.message);
  }

  // Step 2: static client with access_token only — bypasses Node 20 refresh machinery
  const staticClient = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  staticClient.setCredentials({ access_token: accessToken });
  return staticClient;
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
}

// GET /api/documents/:id
// Copies the brief Google Doc template, replaces placeholder tags with show
// data, moves the copy to the הפקות Drive folder, and returns { url }.
router.get('/:id', async (req, res) => {
  try {
    const shows = await readShows(req.userId);
    const show  = shows.find((s) => s.id === req.params.id);
    if (!show) return res.status(404).json({ error: 'Show not found' });

    const auth  = await getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const docs  = google.docs({ version: 'v1', auth });

    // Duplicate the template
    const title   = `דף תיאום ${show.name} ${formatDate(show.date)}`;
    const copyRes = await drive.files.copy({
      fileId: BRIEF_TEMPLATE_ID,
      requestBody: { name: title },
    });
    const docId = copyRes.data.id;

    // Replace every placeholder tag with the corresponding show field
    const replacements = {
      '{{DATE}}':               formatDate(show.date),
      '{{VENUE}}':              show.venue             || '',
      '{{ADDRESS}}':            show.address           || '',
      '{{EVENT_NAME}}':         show.name              || '',
      '{{CREW_LIST}}':          show.technicalCrew     || '',
      '{{PARKING}}':            show.parking           || '',
      '{{SCHEDULE}}':           show.schedule          || '',
      '{{CONTACTS}}':           show.contacts          || '',
      '{{ADDITIONAL_DETAILS}}': show.additionalDetails || '',
      '{{checkItems}}':         '',
      '{{customFields}}':       '',
      '{{musicians}}':          '',
      '{{food}}':               show.food              || '',
      '{{notes}}':              show.notes             || '',
      '{{transportation}}':     show.transportation    || '',
      '{{sound}}':              show.sound             || '',
      '{{lighting}}':           show.lighting          || '',
      '{{backline}}':           show.backline          || '',
    };

    const requests = Object.entries(replacements).map(([find, replace]) => ({
      replaceAllText: {
        containsText: { text: find, matchCase: true },
        replaceText:  replace,
      },
    }));
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });

    // Move the new doc into the הפקות Drive folder (non-fatal if it fails)
    try {
      const folderQ   = "mimeType='application/vnd.google-apps.folder' and name='הפקות' and trashed=false";
      const folderRes = await drive.files.list({ q: folderQ, fields: 'files(id)', pageSize: 1 });
      let folderId;
      if (folderRes.data.files.length > 0) {
        folderId = folderRes.data.files[0].id;
      } else {
        const created = await drive.files.create({
          requestBody: { name: 'הפקות', mimeType: 'application/vnd.google-apps.folder' },
          fields: 'id',
        });
        folderId = created.data.id;
      }
      const fileInfo = await drive.files.get({ fileId: docId, fields: 'parents' });
      await drive.files.update({
        fileId: docId,
        addParents:    folderId,
        removeParents: (fileInfo.data.parents || []).join(','),
        fields: 'id,parents',
      });
    } catch (e) {
      console.warn('[documents] Failed to move to הפקות folder (non-fatal):', e.message);
    }

    const url = `https://docs.google.com/document/d/${docId}/edit`;
    console.log(`[documents] created doc for show ${show.id}: ${url}`);
    res.json({ url });
  } catch (err) {
    console.error('[documents] generation failed:', err.message);
    res.status(500).json({ error: 'Document generation failed', details: err.message });
  }
});

module.exports = router;

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'data/gmail-credentials.json');
const TOKEN_PATH       = path.join(__dirname, 'data/gmail-token.json');
const XLSX_PATH        = path.join(__dirname, '../אסף אמדורסקי לוח הופעות.xlsx');
const SHOWS_FILE       = path.join(__dirname, 'data/shows.json');
const LABEL_PROCESSED  = 'Label_16'; // "production-imported"

const ALLOWED_SENDERS  = ['noa@hamonvolume.com', 'zlilmargalit0@gmail.com'];
const POLL_INTERVAL_MS = 60 * 60 * 1000; // every 1 hour

function isConfigured() {
  return fs.existsSync(CREDENTIALS_PATH) && fs.existsSync(TOKEN_PATH);
}

// Only poll on Sun-Thu (skip Fri=5, Sat=6), between 08:00–21:00 Israel time
function isPollingTime() {
  const israelDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day  = israelDate.getDay();   // 0=Sun … 4=Thu  5=Fri  6=Sat
  const hour = israelDate.getHours();
  return day !== 5 && day !== 6 && hour >= 8 && hour < 21;
}

function getOAuthClient() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  client.setCredentials(tokens);
  // Persist refreshed access tokens automatically
  client.on('tokens', (newTokens) => {
    const current = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...newTokens }, null, 2));
  });
  return client;
}

function findXlsxPart(parts) {
  if (!parts) return null;
  for (const part of parts) {
    if (part.mimeType && (
      part.mimeType.includes('spreadsheet') ||
      part.mimeType.includes('xlsx') ||
      part.mimeType.includes('vnd.openxmlformats')
    )) return part;
    const nested = findXlsxPart(part.parts);
    if (nested) return nested;
  }
  return null;
}

// Returns { added: N } — used both by the scheduler and the manual sync endpoint
async function checkGmail({ force = false } = {}) {
  if (!isConfigured()) return { added: 0 };
  if (!force && !isPollingTime()) {
    console.log('[gmail] Outside polling window — skipping');
    return { added: 0 };
  }

  let totalAdded = 0;
  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const q = `from:(${ALLOWED_SENDERS.join(' OR ')}) has:attachment filename:.xlsx -label:production-imported`;
    const listRes = await gmail.users.threads.list({ userId: 'me', q, maxResults: 5 });
    const threads = listRes.data.threads || [];
    if (threads.length === 0) return;

    const { findNewShows } = require('./routes/import');

    // Gmail API returns threads newest-first by default — no manual sort needed.
    // Only import from the first (newest) thread; label all threads as processed.
    let importedFromNewest = false;

    for (const t of threads) {
      const threadData = await gmail.users.threads.get({ userId: 'me', id: t.id });
      const messages = threadData.data.messages || [];

      for (const msg of messages) {
        const xlsxPart = findXlsxPart(msg.payload.parts || []);
        if (!xlsxPart || !xlsxPart.body.attachmentId) continue;

        if (!importedFromNewest) {
          // Download and import only from the newest thread
          const attRes = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: msg.id,
            id: xlsxPart.body.attachmentId,
          });
          const data = attRes.data.data.replace(/-/g, '+').replace(/_/g, '/');
          const buf  = Buffer.from(data, 'base64');
          fs.writeFileSync(XLSX_PATH, buf);
          console.log(`[gmail] Saved xlsx from message ${msg.id} (${buf.length} bytes)`);

          const existing = JSON.parse(fs.readFileSync(SHOWS_FILE, 'utf8'));
          const newShows = findNewShows(XLSX_PATH, existing);
          if (newShows.length > 0) {
            fs.writeFileSync(SHOWS_FILE, JSON.stringify([...existing, ...newShows], null, 2));
            totalAdded += newShows.length;
            console.log(`[gmail] Imported ${newShows.length} new shows`);
          } else {
            console.log('[gmail] No new shows to add');
          }
          importedFromNewest = true;
        } else {
          console.log(`[gmail] Skipping older thread ${t.id} (already imported from newest)`);
        }
        break; // one xlsx per thread
      }

      // Label the entire thread (not just one message) as processed
      try {
        await gmail.users.threads.modify({
          userId: 'me',
          id: t.id,
          requestBody: { addLabelIds: [LABEL_PROCESSED] },
        });
        console.log(`[gmail] Labeled thread ${t.id} as production-imported`);
      } catch (labelErr) {
        console.error(`[gmail] Failed to label thread ${t.id}:`, labelErr.message);
      }
    }
  } catch (err) {
    console.error('[gmail] Error during Gmail check:', err.message);
  }
  return { added: totalAdded };
}

function startPolling() {
  if (!isConfigured()) {
    console.log('[gmail] Credentials not found — Gmail auto-import is disabled.');
    console.log('[gmail] To enable: save OAuth credentials to server/data/gmail-credentials.json');
    console.log('[gmail] Then run: node server/scripts/gmail-auth.js');
    return;
  }
  console.log('[gmail] Gmail polling active (every 1 hour)');
  checkGmail(); // Check immediately on startup
  setInterval(checkGmail, POLL_INTERVAL_MS);
}

module.exports = { startPolling, checkGmail };

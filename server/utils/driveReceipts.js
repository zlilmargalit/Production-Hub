// Mirror receipt files to Google Drive, for the accountant.
//
// The volume is the source of truth — this is an ADDITIONAL copy, never the only
// one. Every function here is best-effort: it catches everything and returns
// null on any failure, because the same Google auth that powers this breaks
// intermittently, and a stylist saving a receipt must never see it fail because
// Drive was unreachable. When it works the file lands in
//
//     <workspace name> / חשבוניות / <project> — <date> — <shop>.<ext>
//
// Files are created PRIVATE. A receipt is a financial document; the production
// side makes brief docs world-readable, but that is exactly wrong here.

const path = require('path');
const fsp  = require('fs').promises;
const fs   = require('fs');
const { google } = require('googleapis');
const { Readable } = require('stream');

const { getGoogleAuth } = require('./googleAuth');
const { dataPath, parseUserId, DATA_DIR } = require('./userData');

const INVOICES_FOLDER = 'חשבוניות';

// Drive tolerates most characters in a name, but a slash starts a path and
// newlines make an unusable filename. Collapse whitespace so names stay tidy.
const cleanName = (s) => String(s || '')
  .replace(/[/\\\n\r\t]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();

// Find a folder by name under a parent (or root when parentId is null), or make
// it. Returns the folder id.
async function findOrCreateFolder(drive, name, parentId) {
  const safe = name.replace(/'/g, "\\'");
  const scope = parentId ? ` and '${parentId}' in parents` : '';
  const q = `mimeType='application/vnd.google-apps.folder' and name='${safe}' and trashed=false${scope}`;
  const found = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (found.data.files.length > 0) return found.data.files[0].id;

  const made = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  return made.data.id;
}

// The workspace's display name, for the top folder. artists.json lives at the
// real-user level, NOT inside the artist's own directory — so it is read with
// the artist scope stripped, or dataPath would look in the wrong place and the
// name would silently fall back to "Administration". Read directly (best-effort,
// infrequent) to avoid any cache-key mismatch with the artists router.
async function workspaceName(userId) {
  try {
    const { realUserId, artistId } = parseUserId(userId);
    if (!artistId) return 'Administration';
    const file = dataPath(realUserId, 'artists.json');
    const artists = JSON.parse(await fsp.readFile(file, 'utf8'));
    const found = (Array.isArray(artists) ? artists : []).find((a) => a.id === artistId);
    return cleanName(found?.name) || 'Administration';
  } catch {
    return 'Administration';
  }
}

// Map a stored receipt URL (/api/receipts/<uuid>.<ext>) back to its file on the
// volume. Returns null if the URL is not the shape this app produces — never
// trusts it into a path.
function receiptDiskPath(userId, receiptUrl) {
  const m = String(receiptUrl || '').match(/^\/api\/receipts\/([0-9a-f-]{36}\.(?:jpg|png|webp|pdf))$/);
  if (!m) return null;
  const file = dataPath(userId, path.join('receipts', m[1]));
  // Even with the pattern above, refuse anything that resolved outside the
  // workspace's receipts directory.
  const base = dataPath(userId, 'receipts');
  return path.resolve(file).startsWith(path.resolve(base)) ? file : null;
}

const MIME_FOR_EXT = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
};

/**
 * Push one receipt to Drive. Best-effort: returns the Drive view URL, or null on
 * ANY failure (auth down, file missing, quota). Never throws.
 *
 * @param {object}  a
 * @param {string}  a.userId      the request's scoped user id
 * @param {string}  a.receiptUrl  the stored /api/receipts/... URL
 * @param {string}  a.baseName    "<project> — <date> — <shop>" (extension added here)
 */
async function syncReceiptToDrive({ userId, receiptUrl, baseName }) {
  try {
    // Operational kill-switch. The volume copy is always kept regardless; this
    // only turns off the Drive mirror — set it if the Google auth this rides on
    // starts causing trouble, or to keep local/CI runs off the real Drive.
    if (process.env.DRIVE_RECEIPTS_SYNC === 'off') return null;

    const disk = receiptDiskPath(userId, receiptUrl);
    if (!disk || !fs.existsSync(disk)) return null;

    const ext  = path.extname(disk).slice(1).toLowerCase();
    const mime = MIME_FOR_EXT[ext];
    if (!mime) return null;

    const auth  = await getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    const wsFolder  = await findOrCreateFolder(drive, await workspaceName(userId), null);
    const invFolder = await findOrCreateFolder(drive, INVOICES_FOLDER, wsFolder);

    const name = `${cleanName(baseName) || 'receipt'}.${ext}`;
    const res  = await drive.files.create({
      requestBody: { name, parents: [invFolder] },
      media: { mimeType: mime, body: Readable.from(await fsp.readFile(disk)) },
      fields: 'id, webViewLink',
    });
    // Deliberately NOT made public — a receipt is private financial data. It is
    // reachable by whoever the folder is shared with, and no one else.
    return res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`;
  } catch (e) {
    console.warn('[driveReceipts] sync skipped:', e.message);
    return null;
  }
}

module.exports = { syncReceiptToDrive, DATA_DIR };

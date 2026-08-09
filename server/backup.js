// Automated backup of DATA_DIR.
//
// Why this exists: there is no database. Every show, crew member, task, user and
// team setting lives as JSON on a single Railway volume. Before this module the
// volume was the only copy — a bad write, an accidental delete, or a lost volume
// meant permanent loss. (server/scripts/restore-data.js is NOT a restore-from-
// backup: it uploads your local server/data to a deployment.)
//
// What it does, daily:
//   1. Zips DATA_DIR into a timestamped archive.
//   2. Keeps a rotating copy on the volume  → undo for a bad write / accidental delete.
//   3. Uploads it to Google Drive           → survives losing the volume entirely.
//   4. Records the outcome so a silent failure is visible (see /api/admin/backup-status).
//
// Google Drive is the off-site target because it reuses the OAuth this app
// already has — no new account or credential to manage. The tradeoff is that if
// that token dies, uploads stop; that's exactly why the status endpoint reports
// staleness instead of failing quietly.
//
// Secrets (gmail token/credentials, service-account key) are deliberately NOT
// archived: they are re-obtainable by re-authenticating, and keeping them out
// limits the damage if a backup is ever exposed.

const fs   = require('fs');
const fsp  = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const { google } = require('googleapis');
const { DATA_DIR } = require('./utils/userData');

const BACKUP_DIR   = path.join(DATA_DIR, '_backups');
const STATUS_FILE  = path.join(BACKUP_DIR, 'status.json');
const DRIVE_FOLDER = process.env.BACKUP_DRIVE_FOLDER || 'Production Hub Backups';
const KEEP_LOCAL   = Number(process.env.BACKUP_KEEP_LOCAL || 7);
const KEEP_REMOTE  = Number(process.env.BACKUP_KEEP_REMOTE || 30);

// Never archived: secrets, the demo fixture, and the backup folder itself.
const EXCLUDE = new Set(['gmail-token.json', 'gmail-credentials.json', 'service-account.json', 'demo.json']);
const EXCLUDE_DIRS = new Set(['_backups', 'node_modules']);

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// ── Archive ─────────────────────────────────────────────────────────────────
function addDir(zip, absDir, relDir = '') {
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      addDir(zip, path.join(absDir, e.name), relDir ? `${relDir}/${e.name}` : e.name);
    } else if (!EXCLUDE.has(e.name)) {
      try { zip.addLocalFile(path.join(absDir, e.name), relDir); } catch { /* skip unreadable */ }
    }
  }
}

function buildArchive() {
  const zip = new AdmZip();
  addDir(zip, DATA_DIR);
  return zip.toBuffer();
}

// ── Local rotation ──────────────────────────────────────────────────────────
async function writeLocal(buf, name) {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, name);
  await fsp.writeFile(dest, buf);
  const files = (await fsp.readdir(BACKUP_DIR))
    .filter((f) => f.endsWith('.zip')).sort();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_LOCAL))) {
    await fsp.unlink(path.join(BACKUP_DIR, old)).catch(() => {});
  }
  return dest;
}

// ── Google Drive ────────────────────────────────────────────────────────────
async function folderId(drive) {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${DRIVE_FOLDER}' and trashed=false`;
  const found = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (found.data.files?.length) return found.data.files[0].id;
  const made = await drive.files.create({
    requestBody: { name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return made.data.id;
}

async function uploadToDrive(buf, name) {
  const { getGoogleAuth } = require('./utils/googleAuth');
  const auth  = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const parent = await folderId(drive);
  const { Readable } = require('stream');
  const res = await drive.files.create({
    requestBody: { name, parents: [parent] },
    media: { mimeType: 'application/zip', body: Readable.from(buf) },
    fields: 'id',
  });
  // Retention: drop the oldest beyond KEEP_REMOTE
  try {
    const list = await drive.files.list({
      q: `'${parent}' in parents and trashed=false`,
      fields: 'files(id,name,createdTime)', orderBy: 'createdTime', pageSize: 200,
    });
    const files = list.data.files || [];
    for (const f of files.slice(0, Math.max(0, files.length - KEEP_REMOTE))) {
      await drive.files.delete({ fileId: f.id }).catch(() => {});
    }
  } catch { /* retention is best-effort */ }
  return res.data.id;
}

// ── Status (so failures are visible, not silent) ────────────────────────────
function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return null; }
}
async function writeStatus(s) {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  await fsp.writeFile(STATUS_FILE, JSON.stringify(s, null, 2), 'utf8');
}

// ── Entry point ─────────────────────────────────────────────────────────────
// Local copy and Drive upload are independent: if Drive fails we still keep the
// local snapshot and report the failure rather than losing the run entirely.
async function runBackup({ trigger = 'cron' } = {}) {
  const startedAt = new Date();
  const name = `production-hub_${stamp(startedAt)}.zip`;
  const result = { startedAt: startedAt.toISOString(), trigger, name, ok: false };
  try {
    const buf = buildArchive();
    result.bytes = buf.length;

    try {
      await writeLocal(buf, name);
      result.local = 'ok';
    } catch (e) { result.local = 'failed'; result.localError = e.message; }

    try {
      result.driveFileId = await uploadToDrive(buf, name);
      result.drive = 'ok';
    } catch (e) { result.drive = 'failed'; result.driveError = e.message; }

    result.ok = result.local === 'ok' || result.drive === 'ok';
  } catch (e) {
    result.error = e.message;
  }
  result.finishedAt = new Date().toISOString();
  await writeStatus(result).catch(() => {});
  console.log(`[backup] ${result.ok ? 'OK' : 'FAILED'} ${name} local=${result.local} drive=${result.drive}${result.driveError ? ' (' + result.driveError + ')' : ''}`);
  return result;
}

function status() {
  const last = readStatus();
  let localCount = 0;
  try { localCount = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.zip')).length; } catch {}
  const ageHours = last?.finishedAt
    ? Math.round((Date.now() - new Date(last.finishedAt).getTime()) / 36e5) : null;
  return {
    configured: true,
    last, localCount, ageHours,
    // Surfaced so a quietly-dead backup is noticeable rather than assumed fine
    stale: ageHours === null || ageHours > 48,
    keepLocal: KEEP_LOCAL, keepRemote: KEEP_REMOTE, driveFolder: DRIVE_FOLDER,
  };
}

function startSchedule() {
  let cron;
  try { cron = require('node-cron'); } catch { return; }
  // 03:30 Israel time — quiet hours, after the day's edits
  cron.schedule('30 3 * * *', () => runBackup({ trigger: 'cron' }), { timezone: 'Asia/Jerusalem' });
  console.log('[backup] Daily backup scheduled (03:30 Asia/Jerusalem)');
}

module.exports = { runBackup, status, startSchedule, BACKUP_DIR };

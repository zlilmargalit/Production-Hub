#!/usr/bin/env node
// Restore DATA_DIR from a backup archive produced by server/backup.js.
//
// A backup nobody has restored from is a hypothesis, not a safety net — this is
// the other half of server/backup.js.
//
// Usage:
//   node server/scripts/restore-backup.js <archive.zip> [--target <dir>] [--force]
//
//   --target <dir>  restore somewhere other than DATA_DIR (use this to rehearse
//                   a restore safely without touching live data)
//   --force         required to overwrite a non-empty target
//
// Safety: before overwriting anything it snapshots the current target into
// <target>/_pre-restore_<timestamp>.zip, so a restore can itself be undone.

const fs   = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const args = process.argv.slice(2);
const archive = args[0];
const force   = args.includes('--force');
const tIdx    = args.indexOf('--target');
const target  = tIdx !== -1 ? args[tIdx + 1] : (process.env.DATA_DIR || path.join(__dirname, '../data'));

if (!archive || archive.startsWith('--')) {
  console.error('Usage: node server/scripts/restore-backup.js <archive.zip> [--target <dir>] [--force]');
  process.exit(1);
}
if (!fs.existsSync(archive)) {
  console.error(`Archive not found: ${archive}`);
  process.exit(1);
}

const zip = new AdmZip(archive);
const entries = zip.getEntries().filter((e) => !e.isDirectory);
if (!entries.length) {
  console.error('Archive contains no files — refusing to restore.');
  process.exit(1);
}

// Sanity-check the archive before trusting it: it must contain parseable JSON
// and at least one recognisable data file.
let bad = 0;
const names = entries.map((e) => e.entryName);
for (const e of entries) {
  if (!e.entryName.endsWith('.json')) continue;
  try { JSON.parse(zip.readAsText(e)); } catch { bad++; console.error(`  corrupt JSON in archive: ${e.entryName}`); }
}
if (bad) { console.error(`${bad} unreadable file(s) — refusing to restore.`); process.exit(1); }
if (!names.some((n) => n.endsWith('shows.json'))) {
  console.error('No shows.json anywhere in the archive — this does not look like a Production Hub backup.');
  process.exit(1);
}

const existing = fs.existsSync(target)
  ? fs.readdirSync(target).filter((f) => !f.startsWith('_pre-restore')) : [];
if (existing.length && !force) {
  console.error(`Target ${target} is not empty (${existing.length} entries). Re-run with --force to overwrite.`);
  process.exit(1);
}

// Snapshot what's there now, so the restore is reversible.
if (existing.length) {
  const safety = new AdmZip();
  for (const f of existing) {
    const p = path.join(target, f);
    try {
      if (fs.statSync(p).isDirectory()) safety.addLocalFolder(p, f);
      else safety.addLocalFile(p);
    } catch { /* skip unreadable */ }
  }
  const stampName = `_pre-restore_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  fs.writeFileSync(path.join(target, stampName), safety.toBuffer());
  console.log(`Snapshotted current data → ${stampName}`);
}

fs.mkdirSync(target, { recursive: true });
zip.extractAllTo(target, true);
console.log(`Restored ${entries.length} file(s) → ${target}`);
console.log('Note: Google credentials are not included in backups — re-authenticate to restore Brief/PDF/Drive export.');

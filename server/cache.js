// Shared in-memory cache + tiny helper for "read-through" file caching.
//
// Used by routes that hit JSON files on every request. GET endpoints read
// through this cache; mutating endpoints (POST/PUT/DELETE) and external
// writers (gmail-poll, chokidar import) call invalidate(key) afterwards.

const NodeCache = require('node-cache');
const fs  = require('fs');
const fsp = require('fs').promises;

// stdTTL=0 → entries never expire by time; we manage invalidation explicitly.
//
// useClones=TRUE → get() returns a deep clone, so mutating a value you read
// does NOT change what is cached. That is the safe direction: a caller can't
// corrupt the cache by accident. Two consequences worth knowing:
//   - Mutating a read and skipping the write silently does nothing. Always
//     write back through writeJsonAndCache / updateJsonAndCache.
//   - Every cache hit pays a deep clone, which is not free on the larger files.
// This comment previously described useClones=false and warned against in-place
// mutation; it contradicted the constructor. The constructor is authoritative —
// do not "fix" one to match the other without re-checking every caller.
const cache = new NodeCache({ stdTTL: 0, useClones: true });

// Read a JSON file through the cache. If the key is hot we skip disk entirely.
async function readJsonCached(key, filePath, fallback = []) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    cache.set(key, parsed);
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      cache.set(key, fallback);
      return fallback;
    }
    throw err;
  }
}

// ── Version history ─────────────────────────────────────────────────────────
// A nightly backup cannot recover a show deleted at 15:00. So before every
// overwrite we keep the file's PREVIOUS contents, gzipped, under
// DATA_DIR/_versions/<file>/<timestamp>.json.gz. Every change is therefore
// recoverable within the retained window, not just changes older than the last
// backup. Gzip matters: shows.json is ~2.6MB raw but compresses ~10x.
const path = require('path');
const zlib = require('zlib');
const { DATA_DIR } = require('./utils/userData');

const KEEP_VERSIONS = Number(process.env.KEEP_VERSIONS || 40);
const VERSIONS_DIR  = path.join(DATA_DIR, '_versions');
const versionsOff   = process.env.VERSIONS === 'off';

function versionDirFor(filePath) {
  // Mirror the file's location under DATA_DIR so versions stay identifiable
  let rel = path.relative(DATA_DIR, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) rel = path.basename(filePath);
  return path.join(VERSIONS_DIR, rel.replace(/[\\/]/g, '__'));
}

// Snapshot the file being replaced. Best-effort: a versioning failure must never
// block the actual write.
async function snapshotPrevious(filePath) {
  if (versionsOff) return;
  let prev;
  try { prev = await fsp.readFile(filePath); } catch { return; } // first write — nothing to keep
  try {
    const dir = versionDirFor(filePath);
    await fsp.mkdir(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.writeFile(path.join(dir, `${ts}.json.gz`), zlib.gzipSync(prev));
    const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json.gz')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_VERSIONS))) {
      await fsp.unlink(path.join(dir, old)).catch(() => {});
    }
  } catch { /* never block the write on version bookkeeping */ }
}

// ── Per-file serialization ──────────────────────────────────────────────────
// Everything runs in one Node process, but requests and the cron jobs
// (gmail-poll, automations, notifications) interleave at every await. A promise
// chain per path serializes work on the same file so a read-modify-write can't
// be interleaved by another one — which is how updates get silently lost.
const _locks = new Map();
function withFileLock(filePath, fn) {
  const prev = _locks.get(filePath) || Promise.resolve();
  const run  = prev.then(fn, fn);                 // run regardless of prior outcome

  // `settled` never rejects: the next writer chains off it, and every promise
  // derived from the chain must be handled. This used to be `run.finally(...)`,
  // whose returned promise inherits run's rejection and was handled by nobody —
  // so any error inside a locked write (a validation failure inside a mutator,
  // for instance) became an unhandled rejection and killed the process, even
  // though the caller's own try/catch had already dealt with it correctly.
  const settled = run.then(() => {}, () => {});
  _locks.set(filePath, settled);
  // Drop the entry once this is the last queued work for the path, so the map
  // doesn't grow forever. Comparing against `settled` is what makes that safe:
  // if another writer has already queued behind us, the entry is theirs now.
  settled.then(() => { if (_locks.get(filePath) === settled) _locks.delete(filePath); });

  return run;                                     // the caller still sees errors
}

// Atomic JSON write: temp file in the same directory, then rename over the
// target. rename() is atomic on the filesystem, so a crash or an overlapping
// write can never leave a half-written, unparseable file — which an in-place
// writeFile can, silently corrupting real data.
async function writeJsonAtomic(filePath, data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const tmp  = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsp.writeFile(tmp, json);
    await fsp.rename(tmp, filePath);
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  }
}

// Synchronous counterpart, for the handful of call sites that write config-ish
// files synchronously (users, teams, invitations, activity log…). Same atomic
// temp-then-rename guarantee without forcing those callers to become async.
function writeJsonAtomicSync(filePath, data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const tmp  = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

// Write JSON to disk and refresh the cache. Serialized per file and atomic.
async function writeJsonAndCache(key, filePath, data) {
  return withFileLock(filePath, async () => {
    await snapshotPrevious(filePath);
    await writeJsonAtomic(filePath, data);
    cache.set(key, data);
  });
}

// Read-modify-write as one indivisible step. Use this instead of
// read → mutate → write whenever concurrent callers could touch the same file
// (user requests racing a cron job): the whole sequence holds the file lock, and
// the read deliberately bypasses the cache so it always sees the latest data.
async function updateJsonAndCache(key, filePath, mutator, fallback = []) {
  return withFileLock(filePath, async () => {
    let current;
    try { current = JSON.parse(await fsp.readFile(filePath, 'utf8')); }
    catch (err) { if (err.code === 'ENOENT') current = fallback; else throw err; }
    const next = await mutator(current);
    if (next === undefined) return current;        // mutator opted out
    await snapshotPrevious(filePath);
    await writeJsonAtomic(filePath, next);
    cache.set(key, next);
    return next;
  });
}

function invalidate(key) {
  cache.del(key);
}

function clearAll() {
  cache.flushAll();
}

module.exports = {
  cache, readJsonCached, writeJsonAndCache, updateJsonAndCache,
  writeJsonAtomic, writeJsonAtomicSync, withFileLock, invalidate, clearAll,
};

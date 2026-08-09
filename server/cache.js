// Shared in-memory cache + tiny helper for "read-through" file caching.
//
// Used by routes that hit JSON files on every request. GET endpoints read
// through this cache; mutating endpoints (POST/PUT/DELETE) and external
// writers (gmail-poll, chokidar import) call invalidate(key) afterwards.

const NodeCache = require('node-cache');
const fsp = require('fs').promises;

// stdTTL=0 → entries never expire by time; we manage invalidation explicitly.
// useClones=false → returns the same object reference (faster, but callers
// must NOT mutate cached objects in place. All our writes replace the array.)
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

// Write JSON to disk and refresh the cache.
// The write is atomic: JSON is written to a temp file in the same directory and
// then renamed over the target. rename() is atomic on the filesystem, so a crash
// or two overlapping writes can never leave a half-written, unparseable file —
// which the previous in-place writeFile could, silently corrupting real data.
async function writeJsonAndCache(key, filePath, data) {
  await snapshotPrevious(filePath);
  const json = JSON.stringify(data, null, 2);
  const tmp  = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsp.writeFile(tmp, json);
    await fsp.rename(tmp, filePath);
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  }
  cache.set(key, data);
}

function invalidate(key) {
  cache.del(key);
}

function clearAll() {
  cache.flushAll();
}

module.exports = { cache, readJsonCached, writeJsonAndCache, invalidate, clearAll };

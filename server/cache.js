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

// Write JSON to disk and refresh the cache atomically.
async function writeJsonAndCache(key, filePath, data) {
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2));
  cache.set(key, data);
}

function invalidate(key) {
  cache.del(key);
}

function clearAll() {
  cache.flushAll();
}

module.exports = { cache, readJsonCached, writeJsonAndCache, invalidate, clearAll };

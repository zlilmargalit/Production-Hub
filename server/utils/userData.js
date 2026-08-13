// Per-user data path and cache-key helpers.
//
// Admin (AUTH_USER from .env) → existing server/data/*.json files (zero change).
// External users              → server/data/users/{userId}/*.json
// Artist-scoped               → compound key "{userId}__art__{artistId}"
//   admin + artist            → server/data/artists/{artistId}/*.json
//   user  + artist            → server/data/users/{userId}/artists/{artistId}/*.json
//
// This keeps full backward compatibility: existing admin sessions and data
// files are unaffected by the multi-user changes.

const path = require('path');
const fs   = require('fs');
const fsp  = require('fs').promises;

// DATA_DIR: use the Railway/env-configured volume path if set,
// otherwise fall back to the local server/data/ directory.
// On Railway, set DATA_DIR to the mounted volume path (e.g. /data) so data
// survives deployments. Without a volume every deploy wipes the container.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const ARTIST_SEP  = '__art__';

// Tests are allowed to mutate data, but only inside a deliberately-created
// temporary directory. Refuse common live locations before this module creates
// or touches anything. The marker prevents an accidental /tmp directory from
// becoming a valid test target merely because it has a convenient name.
function assertSafeTestDataDir(dir = DATA_DIR) {
  if (process.env.NODE_ENV !== 'test') return;

  const resolved = path.resolve(dir);
  const protectedDirs = [
    path.resolve('/data'),
    path.resolve(__dirname, '../data'),
  ];
  const tempRoot = path.resolve(require('os').tmpdir());
  const marker = path.join(resolved, '.production-hub-test-data');

  if (protectedDirs.some((protectedDir) => resolved === protectedDir || resolved.startsWith(protectedDir + path.sep))) {
    throw new Error(`Refusing to run tests against protected DATA_DIR: ${resolved}`);
  }
  if (!resolved.startsWith(tempRoot + path.sep)) {
    throw new Error(`Test DATA_DIR must be below the system temp directory: ${resolved}`);
  }
  if (process.env.PRODUCTION_HUB_TEST_DATA !== resolved || !fs.existsSync(marker)) {
    throw new Error(`Test DATA_DIR is missing its explicit isolation marker: ${resolved}`);
  }
}

assertSafeTestDataDir();

// Eagerly create DATA_DIR on startup so the volume is ready before any request.
fsp.mkdir(DATA_DIR, { recursive: true }).catch(() => {});

// Default content written when a user's or artist's files are created for the first time.
const DEFAULTS = {
  'shows.json':          '[]',
  'crew.json':           '[]',
  'templates.json':      '{}',
  'event-types.json':    '[]',
  'field-templates.json':'{}',
  'tasks.json':          '[]',
  'production-projects.json': '[]',
  'event-type-checklists.json': '{}',
  'timelog.json':        '[]',
};

/**
 * Parse a possibly artist-scoped userId.
 * "admin"         → { realUserId: 'admin', artistId: null }
 * "abc123"        → { realUserId: 'abc123', artistId: null }
 * "abc__art__xyz" → { realUserId: 'abc123', artistId: 'xyz' }
 * "admin__art__xyz" → { realUserId: 'admin', artistId: 'xyz' }
 */
function parseUserId(userId) {
  if (!userId || userId === 'admin') return { realUserId: 'admin', artistId: null };
  const idx = userId.indexOf(ARTIST_SEP);
  if (idx === -1) return { realUserId: userId, artistId: null };
  return {
    realUserId: userId.slice(0, idx),
    artistId:   userId.slice(idx + ARTIST_SEP.length),
  };
}

/** Build the compound scoped userId for a given user + artist pair. */
function artistScopedId(userId, artistId) {
  return `${userId}${ARTIST_SEP}${artistId}`;
}

/** Absolute path to a user's (or artist's) data file. */
function dataPath(userId, file) {
  const { realUserId, artistId } = parseUserId(userId);
  const isAdmin = !realUserId || realUserId === 'admin';

  if (isAdmin) {
    return artistId
      ? path.join(DATA_DIR, 'artists', artistId, file)
      : path.join(DATA_DIR, file);
  }
  return artistId
    ? path.join(DATA_DIR, 'users', realUserId, 'artists', artistId, file)
    : path.join(DATA_DIR, 'users', realUserId, file);
}

/** Cache key namespaced by user (admin keeps the legacy bare keys). */
function cacheKey(userId, name) {
  const { realUserId, artistId } = parseUserId(userId);
  const isAdmin = !realUserId || realUserId === 'admin';

  if (isAdmin) return artistId ? `${name}:art:${artistId}` : name;
  return artistId ? `${name}:${realUserId}:art:${artistId}` : `${name}:${realUserId}`;
}

/**
 * Ensure a user's data directory exists and contains all default files.
 * No-op for admin (uses the top-level data dir which already exists).
 */
async function ensureUserDir(userId) {
  if (!userId || userId === 'admin') return;
  const dir = path.join(DATA_DIR, 'users', userId);
  await fsp.mkdir(dir, { recursive: true });
  for (const [file, defaultContent] of Object.entries(DEFAULTS)) {
    const filePath = path.join(dir, file);
    try {
      await fsp.access(filePath);
    } catch {
      await fsp.writeFile(filePath, defaultContent, 'utf8');
    }
  }
}

/**
 * Ensure an artist's scoped data directory + default files exist.
 * Safe to call on every artist creation.
 */
async function ensureArtistDir(userId, artistId) {
  // Derive directory from the scoped dataPath
  const dir = path.dirname(dataPath(artistScopedId(userId, artistId), 'shows.json'));
  await fsp.mkdir(dir, { recursive: true });
  for (const [file, defaultContent] of Object.entries(DEFAULTS)) {
    const filePath = path.join(dir, file);
    try {
      await fsp.access(filePath);
    } catch {
      await fsp.writeFile(filePath, defaultContent, 'utf8');
    }
  }
}

module.exports = { dataPath, cacheKey, ensureUserDir, ensureArtistDir, artistScopedId, parseUserId, DATA_DIR, assertSafeTestDataDir };

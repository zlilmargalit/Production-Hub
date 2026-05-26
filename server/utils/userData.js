// Per-user data path and cache-key helpers.
//
// Admin (AUTH_USER from .env) → existing server/data/*.json files (zero change).
// External users              → server/data/users/{userId}/*.json
//
// This keeps full backward compatibility: existing admin sessions and data
// files are unaffected by the multi-user changes.

const path = require('path');
const fsp  = require('fs').promises;

const DATA_DIR = path.join(__dirname, '../data');

// Default content written when a user's files are created for the first time.
const DEFAULTS = {
  'shows.json':          '[]',
  'crew.json':           '[]',
  'templates.json':      '{}',
  'event-types.json':    JSON.stringify([
    'חתונה', 'בר מצווה', 'בת מצווה', 'אירוע חברה', 'הופעת אולם',
    'הופעת להקה', 'אירוע פרטי', 'סולו אקוסטי', 'חזרה', 'יום הולדת',
  ]),
  'field-templates.json':'{}',
};

/** Absolute path to a user's data file. */
function dataPath(userId, file) {
  if (!userId || userId === 'admin') return path.join(DATA_DIR, file);
  return path.join(DATA_DIR, 'users', userId, file);
}

/** Cache key namespaced by user (admin keeps the legacy bare keys). */
function cacheKey(userId, name) {
  if (!userId || userId === 'admin') return name;
  return `${name}:${userId}`;
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

module.exports = { dataPath, cacheKey, ensureUserDir, DATA_DIR };

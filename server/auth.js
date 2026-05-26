// Cookie-based session auth — multi-user edition.
//
// Token format: <base64url(payload)>.<base64url(hmac-sha256)>
//   payload = { user, userId, role, t: issued-at-ms }
//   hmac    = HMAC-SHA256(payload, secret derived from AUTH_PASSWORD)
//
// Backward compat: old tokens (payload = { user, t }) have no userId field;
// they are treated as admin sessions.
//
// The secret is derived from AUTH_PASSWORD, so rotating it invalidates admin
// sessions.  User sessions use the same secret (one secret for the whole app).

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

const COOKIE_NAME    = 'ph_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const USERS_FILE = path.join(__dirname, 'data/users.json');

// ── Secret ──────────────────────────────────────────────────────────────────
function getSecret() {
  return crypto
    .createHash('sha256')
    .update('production-hub|' + (process.env.AUTH_PASSWORD || ''))
    .digest();
}

// ── Password hashing (PBKDF2, no new npm deps) ───────────────────────────────
const PBKDF2_ITERS  = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key  = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `pbkdf2:${salt}:${key}`;
}

function verifyPassword(password, hash) {
  try {
    const [, salt, key] = hash.split(':');
    const attempt = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(attempt, 'hex'));
  } catch {
    return false;
  }
}

// ── User store helpers ───────────────────────────────────────────────────────
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// ── Token sign / verify ──────────────────────────────────────────────────────
/**
 * @param {{ userId: string, username: string, role: string }} authUser
 */
function signToken({ userId, username, role }) {
  const payload = Buffer.from(
    JSON.stringify({ user: username, userId, role, t: Date.now() })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Returns { userId, username, role } or null.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.t !== 'number') return null;
    if (Date.now() - data.t > SESSION_TTL_MS) return null;
    // Backward compat: old admin tokens have no userId
    return {
      userId:   data.userId || 'admin',
      username: data.user,
      role:     data.role   || 'admin',
    };
  } catch {
    return null;
  }
}

// ── Credential verification ───────────────────────────────────────────────────
/**
 * Returns { userId, username, role } or null.
 * Priority: admin env vars → users.json
 */
function verifyCredentials(username, password) {
  const AUTH_USER     = process.env.AUTH_USER || 'admin';
  const AUTH_PASSWORD = process.env.AUTH_PASSWORD;

  if (username === AUTH_USER && password === AUTH_PASSWORD) {
    return { userId: 'admin', username: AUTH_USER, role: 'admin' };
  }

  const users = loadUsers();
  const user  = users.find((u) => u.username === username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return { userId: user.id, username: user.username, role: user.role || 'user' };
}

// ── Cookie helpers ───────────────────────────────────────────────────────────
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const piece of header.split(';')) {
    const trimmed = piece.trim();
    if (trimmed.startsWith(name + '=')) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

function cookieOptions(req) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly:  true,
    secure:    isHttps,
    sameSite:  'lax',
    maxAge:    SESSION_TTL_MS,
    path:      '/',
  };
}

// ── Request auth resolution ──────────────────────────────────────────────────
/**
 * Returns { userId, username, role } or null.
 * Also handles Basic auth (admin only, for curl/scripts).
 */
function getAuthUser(req) {
  // 1. Cookie session
  const token = getCookie(req, COOKIE_NAME);
  if (token) {
    const user = verifyToken(token);
    if (user) return user;
  }
  // 2. Basic auth (always maps to admin)
  const header = req.headers.authorization;
  if (header && header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const idx  = decoded.indexOf(':');
      if (idx >= 0) {
        const u = decoded.slice(0, idx);
        const p = decoded.slice(idx + 1);
        const AUTH_USER     = process.env.AUTH_USER || 'admin';
        const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
        if (u === AUTH_USER && p === AUTH_PASSWORD) {
          return { userId: 'admin', username: AUTH_USER, role: 'admin' };
        }
      }
    } catch { /* fall through */ }
  }
  return null;
}

/** Kept for backward-compat call sites that only need a boolean. */
function checkAuthed(req) {
  return !!getAuthUser(req);
}

module.exports = {
  COOKIE_NAME,
  signToken,
  verifyToken,
  verifyCredentials,
  getCookie,
  getAuthUser,
  checkAuthed,
  cookieOptions,
  hashPassword,
  verifyPassword,
  loadUsers,
  saveUsers,
};

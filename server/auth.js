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
const { DATA_DIR } = require('./utils/userData');

const COOKIE_NAME    = 'ph_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const USERS_FILE = path.join(DATA_DIR, 'users.json');

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

// ── TOTP (RFC 6238) — pure Node.js crypto, no external deps ─────────────────
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (let i = 0; i < buf.length; i++) {
    val = (val << 8) | buf[i];
    bits += 8;
    while (bits >= 5) { out += BASE32_CHARS[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32_CHARS[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const s = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const idx = BASE32_CHARS.indexOf(s[i]);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function _totpCode(secret, t) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(t));
  const hash   = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hash[hash.length - 1] & 0xf;
  const code   = (
    ((hash[offset]     & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) <<  8) |
     (hash[offset + 3] & 0xff)
  ) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** Verify a 6-digit TOTP code with a ±1 time-step window. */
function verifyTotp(secret, code) {
  if (!secret || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return false;
  const t = Math.floor(Date.now() / 30_000);
  for (let i = -1; i <= 1; i++) {
    if (_totpCode(secret, t + i) === code.trim()) return true;
  }
  return false;
}

/** Build an otpauth:// URI for authenticator apps (Google Auth, Authy, etc.). */
function buildOtpAuthUri(secret, username, issuer = 'Production Hub') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}` +
         `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Pending-2FA short-lived token (5 min, never grants app access) ───────────
const PENDING_2FA_COOKIE  = 'ph_2fa_pending';
const PENDING_2FA_TTL_MS  = 5 * 60 * 1000;

function signPending2faToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyPending2faToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() - data.t > PENDING_2FA_TTL_MS) return null;
    return data.userId;
  } catch { return null; }
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
  // TOTP
  generateTotpSecret,
  verifyTotp,
  buildOtpAuthUri,
  // Pending-2FA token
  PENDING_2FA_COOKIE,
  signPending2faToken,
  verifyPending2faToken,
};

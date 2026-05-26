// Cookie-based session auth.
//
// Why not express-basic-auth? Mobile Safari and PWAs frequently refuse to
// render the native basic-auth dialog — users just see a raw 401 JSON page
// with no way to log in. A proper login page + signed cookie works
// identically on desktop, mobile browsers, and home-screen PWAs.
//
// Token format: <base64url(payload)>.<base64url(hmac-sha256)>
//   payload = { user, t: issued-at-ms }
//   hmac    = HMAC-SHA256(payload, secret)
//
// Tokens are valid for 30 days. The secret is derived from AUTH_PASSWORD so
// rotating the password automatically invalidates all existing sessions.

const crypto = require('crypto');

const COOKIE_NAME   = 'ph_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret() {
  // Mix in a fixed string so the HMAC key isn't equal to the raw password.
  return crypto
    .createHash('sha256')
    .update('production-hub|' + (process.env.AUTH_PASSWORD || ''))
    .digest();
}

function signToken(user) {
  const payload = Buffer.from(JSON.stringify({ user, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  // timingSafeEqual requires equal-length buffers; fall through to false otherwise
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.t !== 'number') return null;
    if (Date.now() - data.t > SESSION_TTL_MS) return null;
    return data.user;
  } catch {
    return null;
  }
}

// Parse a single cookie value out of the request headers without pulling in
// the cookie-parser dependency.
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

// Check a Basic auth Authorization header against the configured credentials.
// Kept alongside cookies so curl / scripts can still hit the API without
// going through the login form.
function checkBasicAuth(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch { return false; }
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  return user === process.env.AUTH_USER && pass === process.env.AUTH_PASSWORD;
}

function checkAuthed(req) {
  const sessionUser = verifyToken(getCookie(req, COOKIE_NAME));
  if (sessionUser) return true;
  return checkBasicAuth(req);
}

// Build the Set-Cookie attributes. `secure` is on when the request came in
// over HTTPS (or via a TLS-terminating proxy like Railway sending the
// x-forwarded-proto header).
function cookieOptions(req) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

module.exports = {
  COOKIE_NAME,
  signToken,
  verifyToken,
  getCookie,
  checkAuthed,
  cookieOptions,
};

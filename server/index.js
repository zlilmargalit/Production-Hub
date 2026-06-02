require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const fsp      = require('fs').promises;
const path     = require('path');
const os       = require('os');
const chokidar = require('chokidar');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');

const {
  COOKIE_NAME, signToken, getAuthUser, checkAuthed,
  cookieOptions, verifyCredentials, hashPassword, verifyPassword,
  loadUsers, saveUsers,
  generateTotpSecret, verifyTotp, buildOtpAuthUri,
  PENDING_2FA_COOKIE, signPending2faToken, verifyPending2faToken,
  getCookie,
} = require('./auth');
const loginPage  = require('./login-page');
const invitePage = require('./invite-page');

const artistsRouter       = require('./routes/artists');
const showsRouter         = require('./routes/shows');
const documentsRouter     = require('./routes/documents');
const crewRouter          = require('./routes/crew');
const templatesRouter     = require('./routes/templates');
const eventTypesRouter    = require('./routes/event-types');
const rolesRouter         = require('./routes/roles');
const techSpecRouter      = require('./routes/tech-spec');
const fieldTemplatesRouter= require('./routes/field-templates');
const { router: importRouter, findNewShows, DEFAULT_XLSX } = require('./routes/import');
const calendarRouter      = require('./routes/calendar');
const tasksRouter         = require('./routes/tasks');
const spotifyRouter       = require('./routes/spotify');
const { router: automationsRouter, publicRouter: automationsPublicRouter, startCron: startAutomationsCron } = require('./routes/automations');
const driveRouter             = require('./routes/drive');
const { startPolling: startGmailPolling } = require('./gmail-poll');
const { readJsonCached, writeJsonAndCache, clearAll: clearCache } = require('./cache');
const { shutdown: shutdownPuppeteer } = require('./pdf');
const { DATA_DIR, ensureUserDir, dataPath: udDataPath, cacheKey: udCacheKey, artistScopedId } = require('./utils/userData');

// ── Gmail credentials (for team notify) ─────────────────────────────────────
const GMAIL_CREDENTIALS_PATH = path.join(__dirname, 'data/gmail-credentials.json');
const GMAIL_TOKEN_PATH       = path.join(__dirname, 'data/gmail-token.json');

function gmailConfigured() {
  if (process.env.GMAIL_CREDENTIALS && process.env.GMAIL_TOKEN) return true;
  return fs.existsSync(GMAIL_CREDENTIALS_PATH) && fs.existsSync(GMAIL_TOKEN_PATH);
}

function getGmailOAuth() {
  const creds = process.env.GMAIL_CREDENTIALS
    ? JSON.parse(process.env.GMAIL_CREDENTIALS)
    : JSON.parse(fs.readFileSync(GMAIL_CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const tokens = process.env.GMAIL_TOKEN
    ? JSON.parse(process.env.GMAIL_TOKEN)
    : JSON.parse(fs.readFileSync(GMAIL_TOKEN_PATH, 'utf8'));
  auth.setCredentials(tokens);
  return auth;
}

// Send email via Gmail API (already-authed OAuth client)
async function sendGmail(to, subject, textBody) {
  const auth  = getGmailOAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const raw   = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    textBody,
  ].join('\r\n');
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(raw).toString('base64url') },
  });
}

// ── Team activity log ────────────────────────────────────────────────────────
const ACTIVITY_FILE = path.join(DATA_DIR, 'team-activity.json');

function loadActivity() {
  try { return JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8')); } catch { return []; }
}
function logActivity(userId, username, action, detail = '') {
  if (!userId || userId === 'admin') return;
  try {
    const log = loadActivity();
    log.unshift({ userId, username, action, detail, timestamp: new Date().toISOString() });
    if (log.length > 500) log.length = 500;
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(log, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

// ── Invitation / team-settings paths ────────────────────────────────────────
const INVITATIONS_FILE   = path.join(DATA_DIR, 'invitations.json');
const TEAM_SETTINGS_FILE = path.join(DATA_DIR, 'team-settings.json');
const TEAMS_FILE         = path.join(DATA_DIR, 'teams.json');
const JOIN_REQUESTS_FILE = path.join(DATA_DIR, 'join-requests.json');

function loadJoinRequests() {
  try { return JSON.parse(fs.readFileSync(JOIN_REQUESTS_FILE, 'utf8')); } catch { return []; }
}
function saveJoinRequests(list) {
  fs.writeFileSync(JOIN_REQUESTS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function loadInvitations() {
  try { return JSON.parse(fs.readFileSync(INVITATIONS_FILE, 'utf8')); } catch { return []; }
}
function saveInvitations(list) {
  fs.writeFileSync(INVITATIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
}
function loadTeamSettings() {
  try {
    return JSON.parse(fs.readFileSync(TEAM_SETTINGS_FILE, 'utf8'));
  } catch {
    return { visibleRubrics: ['schedule', 'logistics', 'technical', 'notes'], userArtistAccess: {}, userPermissions: {} };
  }
}
function saveTeamSettings(settings) {
  fs.writeFileSync(TEAM_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}
function loadTeams() {
  try { return JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8')); } catch { return []; }
}
function saveTeams(teams) {
  fs.writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2), 'utf8');
}

/**
 * Normalize userArtistAccess for one user.
 * Handles both old array format `[artistId, ...]` and new per-artist object format
 * `{ artistId: role | { role } }`.
 * Returns: { [artistId]: { role, visibleRubrics, editRubrics } }
 */
function normalizeUserAccess(settings, userId) {
  const raw = (settings.userArtistAccess || {})[userId];
  if (!raw) return {};
  const perms       = (settings.userPermissions || {})[userId] || {};
  const visRubrics  = perms.viewRubrics  || settings.visibleRubrics || [];
  const editRubrics = perms.editRubrics  || [];
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw.map((id) => [id, { role: 'viewer', visibleRubrics: visRubrics, editRubrics }])
    );
  }
  return Object.fromEntries(
    Object.entries(raw).map(([artistId, roleInfo]) => {
      const role = typeof roleInfo === 'string' ? roleInfo : (roleInfo?.role || 'viewer');
      return [artistId, { role, visibleRubrics: visRubrics, editRubrics }];
    })
  );
}

function getPermittedArtistIds(settings, userId) {
  return Object.keys(normalizeUserAccess(settings, userId));
}

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Auth config ──────────────────────────────────────────────────────────────
const AUTH_USER     = process.env.AUTH_USER || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;

if (!AUTH_PASSWORD) {
  console.error('[auth] AUTH_PASSWORD is not set. Copy server/.env.example to server/.env and set a real password.');
  process.exit(1);
}
if (AUTH_PASSWORD === 'change-me-please' && process.env.NODE_ENV === 'production') {
  console.error('[auth] AUTH_PASSWORD is still the example default — refuse to boot in production.');
  process.exit(1);
}

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Client dist path (used by /demo) ────────────────────────────────────────
const CLIENT_DIST = path.join(__dirname, '../client/dist');

// ── Public routes (before auth gate) ────────────────────────────────────────
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Login page
app.get('/login', (req, res) => {
  if (checkAuthed(req)) return res.redirect('/');
  if (req.query.step === '2fa') {
    // Only show 2FA page if there's a valid pending token
    const pending = getCookie(req, PENDING_2FA_COOKIE);
    if (verifyPending2faToken(pending)) {
      return res.type('html').send(loginPage({ step: '2fa' }));
    }
    // No valid pending token — back to normal login
    return res.redirect('/login');
  }
  res.type('html').send(loginPage({ error: req.query.error === '1' }));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const authUser = verifyCredentials(username, password);
  if (!authUser) {
    return res.status(401).type('html').send(loginPage({ error: true, username }));
  }

  // Check whether this user has 2FA enabled
  let has2fa = false;
  if (authUser.userId === 'admin') {
    const p = loadAdminProfile();
    has2fa = !!(p.twoFactorEnabled && p.twoFactorSecret);
  } else {
    const user = loadUsers().find((u) => u.id === authUser.userId);
    has2fa = !!(user?.twoFactorEnabled && user?.twoFactorSecret);
  }

  if (has2fa) {
    // Issue a 5-min pending token and redirect to the 2FA step
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(PENDING_2FA_COOKIE, signPending2faToken(authUser.userId), {
      httpOnly: true, secure: isHttps, sameSite: 'lax',
      maxAge: 5 * 60 * 1000, path: '/',
    });
    return res.redirect('/login?step=2fa');
  }

  res.cookie(COOKIE_NAME, signToken(authUser), cookieOptions(req));
  logActivity(authUser.userId, authUser.username, 'login', 'Signed in');
  return res.redirect('/');
});

// ── 2FA verification step ─────────────────────────────────────────────────────
app.post('/login/2fa', (req, res) => {
  const { code } = req.body || {};
  const pendingToken = getCookie(req, PENDING_2FA_COOKIE);
  const userId = verifyPending2faToken(pendingToken);

  if (!userId) {
    // Expired or tampered — go back to login
    res.clearCookie(PENDING_2FA_COOKIE, { path: '/' });
    return res.redirect('/login?error=1');
  }

  if (!code || !/^\d{6}$/.test(code.trim())) {
    return res.type('html').send(loginPage({ step: '2fa', error2fa: 'Enter a 6-digit code.' }));
  }

  let secret   = null;
  let authUser = null;

  if (userId === 'admin') {
    const p = loadAdminProfile();
    if (p.twoFactorEnabled) {
      secret   = p.twoFactorSecret;
      authUser = { userId: 'admin', username: process.env.AUTH_USER || 'admin', role: 'admin' };
    }
  } else {
    const user = loadUsers().find((u) => u.id === userId);
    if (user?.twoFactorEnabled) {
      secret   = user.twoFactorSecret;
      authUser = { userId: user.id, username: user.username, role: user.role || 'user' };
    }
  }

  if (!secret || !verifyTotp(secret, code.trim())) {
    return res.type('html').send(loginPage({ step: '2fa', error2fa: 'Invalid code — please try again.' }));
  }

  res.clearCookie(PENDING_2FA_COOKIE, { path: '/' });
  res.cookie(COOKIE_NAME, signToken(authUser), cookieOptions(req));
  logActivity(authUser.userId, authUser.username, 'login', 'Signed in (2FA)');
  return res.redirect('/');
});

app.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.redirect('/login');
});

// Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, password2 } = req.body || {};

    if (!username || !password) {
      return res.status(400).type('html').send(
        loginPage({ tab: 'register', regError: 'Username and password are required' })
      );
    }
    if (password !== password2) {
      return res.status(400).type('html').send(
        loginPage({ tab: 'register', regError: 'Passwords do not match' })
      );
    }
    if (password.length < 6) {
      return res.status(400).type('html').send(
        loginPage({ tab: 'register', regError: 'Password must be at least 6 characters' })
      );
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
      return res.status(400).type('html').send(
        loginPage({ tab: 'register', regError: 'Username may only contain letters, numbers, _ and -' })
      );
    }

    // Check uniqueness against admin and existing users
    if (username === AUTH_USER) {
      return res.status(409).type('html').send(
        loginPage({ tab: 'register', regError: 'Username already taken' })
      );
    }
    const users = loadUsers();
    if (users.find((u) => u.username === username)) {
      return res.status(409).type('html').send(
        loginPage({ tab: 'register', regError: 'Username already taken' })
      );
    }

    const newUser = {
      id:           uuidv4(),
      username,
      passwordHash: hashPassword(password),
      role:         'user',
      createdAt:    new Date().toISOString(),
    };
    users.push(newUser);
    saveUsers(users);

    // Create the user's data directory with empty default files
    await ensureUserDir(newUser.id);

    // Auto-login
    const authUser = { userId: newUser.id, username, role: 'user' };
    res.cookie(COOKIE_NAME, signToken(authUser), cookieOptions(req));
    return res.redirect('/');
  } catch (err) {
    console.error('[register]', err.message);
    res.status(500).type('html').send(
      loginPage({ tab: 'register', regError: 'Registration failed — please try again' })
    );
  }
});

// ── Invite-registration pages (public, before auth gate) ─────────────────────

// GET /register?token=<uuid> — show invite registration form
app.get('/register', (req, res) => {
  if (checkAuthed(req)) return res.redirect('/');
  const { token } = req.query;
  if (!token) {
    return res.type('html').send(invitePage({ error: 'No invitation token provided. Ask your admin for a fresh link.' }));
  }
  const invitations = loadInvitations();
  const inv = invitations.find((i) => i.token === token);
  if (!inv) {
    return res.type('html').send(invitePage({ error: 'This invitation link is invalid or has already been used.' }));
  }
  if (new Date(inv.expiresAt) < new Date()) {
    return res.type('html').send(invitePage({ error: 'This invitation link has expired. Ask your admin for a new one.' }));
  }
  res.type('html').send(invitePage({ token }));
});

// GET /api/invitations/validate?token=<uuid> — lightweight JSON check
app.get('/api/invitations/validate', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false, error: 'token required' });
  const inv = loadInvitations().find((i) => i.token === token);
  if (!inv || inv.usedBy) return res.json({ valid: false });
  if (new Date(inv.expiresAt) < new Date()) return res.json({ valid: false, error: 'expired' });
  res.json({ valid: true });
});

// POST /api/auth/register-invite — complete registration via invite token
app.post('/api/auth/register-invite', async (req, res) => {
  try {
    const { token, username, password, password2, email } = req.body || {};

    if (!token) {
      return res.status(400).type('html').send(invitePage({ error: 'Missing invitation token.' }));
    }

    const invitations = loadInvitations();
    const inv = invitations.find((i) => i.token === token);
    if (!inv) {
      return res.status(400).type('html').send(invitePage({ error: 'Invalid or already-used invitation link.' }));
    }
    if (new Date(inv.expiresAt) < new Date()) {
      return res.status(400).type('html').send(invitePage({ token, error: 'Invitation has expired.' }));
    }
    if (inv.usedBy) {
      return res.status(400).type('html').send(invitePage({ error: 'This invitation has already been used.' }));
    }

    if (!username || !password) {
      return res.status(400).type('html').send(invitePage({ token, username, error: 'Username and password are required.' }));
    }
    if (password !== password2) {
      return res.status(400).type('html').send(invitePage({ token, username, error: 'Passwords do not match.' }));
    }
    if (password.length < 6) {
      return res.status(400).type('html').send(invitePage({ token, username, error: 'Password must be at least 6 characters.' }));
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
      return res.status(400).type('html').send(invitePage({ token, username, error: 'Username may only contain letters, numbers, _ and -' }));
    }
    if (username === AUTH_USER) {
      return res.status(409).type('html').send(invitePage({ token, username, error: 'Username already taken.' }));
    }

    const users = loadUsers();
    if (users.find((u) => u.username === username)) {
      return res.status(409).type('html').send(invitePage({ token, username, error: 'Username already taken.' }));
    }

    // Create guest user (lowest privilege), inherit workspaceRole from invite
    const newUser = {
      id:            uuidv4(),
      username,
      email:         email?.trim() || null,
      passwordHash:  hashPassword(password),
      role:          'guest',
      workspaceRole: inv.workspaceRole || 'producer',
      createdAt:     new Date().toISOString(),
    };
    users.push(newUser);
    saveUsers(users);
    await ensureUserDir(newUser.id);

    // Mark token as used
    inv.usedBy = newUser.id;
    inv.usedAt = new Date().toISOString();
    saveInvitations(invitations);

    // Auto-login + log
    const authUser = { userId: newUser.id, username, role: 'guest' };
    res.cookie(COOKIE_NAME, signToken(authUser), cookieOptions(req));
    logActivity(newUser.id, username, 'register', 'Joined via invite link');
    return res.redirect('/');
  } catch (err) {
    console.error('[register-invite]', err.message);
    res.status(500).type('html').send(invitePage({ error: 'Registration failed — please try again.' }));
  }
});

// Automations: OAuth callbacks are public (userId carried in signed state param)
app.use('/api/automations', automationsPublicRouter);

// Demo mode — serve the React app with window.__DEMO__ injected (no auth)
app.get('/demo', (req, res) => {
  try {
    const indexPath = path.join(CLIENT_DIST, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(503).send('<p>App not built yet — run npm run build in client/</p>');
    }
    const html = fs.readFileSync(indexPath, 'utf8');
    res.type('html').send(
      html.replace('</head>', '<script>window.__DEMO__=true;</script></head>')
    );
  } catch (err) {
    res.status(500).send('Demo unavailable');
  }
});

// Demo data endpoint (no auth)
app.get('/api/demo/data', (req, res) => {
  try {
    const demo = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/demo.json'), 'utf8'));
    res.json(demo);
  } catch {
    res.json({ shows: [], crew: [], eventTypes: [], fieldTemplates: {}, templates: {} });
  }
});

// PWA assets
app.get(['/manifest.json', '/apple-touch-icon.png', '/icon-180.png', '/icon-192.png', '/icon-512.png'], (req, res, next) => {
  const file = path.join(CLIENT_DIST, req.path);
  if (fs.existsSync(file)) return res.sendFile(file);
  next();
});

// ── Auth gate ────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const authUser = getAuthUser(req);
  if (authUser) {
    req.userId   = authUser.userId;
    req.userRole = authUser.role;
    req.username = authUser.username;
    return next();
  }
  if (req.path.startsWith('/api/') || req.xhr || req.get('accept')?.includes('application/json')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  res.redirect('/login');
});

// ── Temp debug: read artist shows directly from disk (admin only) ─────────────
app.get('/api/debug/artist-shows', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const artistId = req.query.artistId;
  if (!artistId) return res.status(400).json({ error: 'artistId required' });
  const filePath = path.join(DATA_DIR, 'artists', artistId, 'shows.json');
  const artistsFile = path.join(DATA_DIR, 'artists.json');
  try {
    // Check artists.json — if artist is missing here, middleware won't scope requests
    let artistsJson = [];
    try { artistsJson = JSON.parse(await fsp.readFile(artistsFile, 'utf8')); } catch {}
    const artistInList = artistsJson.some((a) => a.id === artistId);

    const raw = await fsp.readFile(filePath, 'utf8');
    const shows = JSON.parse(raw);
    const logisticsFields = ['transportMode','transportDriver','transportTime','foodContactName','foodContactPhone','foodContactTime','soundCoordinated','lightingCoordinated'];
    const summary = shows.map((s) => {
      const lf = {};
      for (const f of logisticsFields) if (s[f]) lf[f] = s[f];
      return { id: s.id, name: s.name, date: s.date, logistics: lf };
    });
    res.json({
      artistInArtistsJson: artistInList,
      artistsJsonCount: artistsJson.length,
      filePath,
      totalShows: shows.length,
      shows: summary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, filePath });
  }
});

// ── Who-am-I (after auth gate) ───────────────────────────────────────────────
const ADMIN_PROFILE_PATH = () => path.join(DATA_DIR, 'admin-profile.json');

function loadAdminProfile() {
  try { return JSON.parse(fs.readFileSync(ADMIN_PROFILE_PATH(), 'utf8')); } catch { return {}; }
}
function saveAdminProfile(p) {
  fs.writeFileSync(ADMIN_PROFILE_PATH(), JSON.stringify(p, null, 2), 'utf8');
}

app.get('/api/me', (req, res) => {
  let workspaceRole = 'producer';
  let displayName   = null;
  let timezone      = null;
  let avatarUrl     = null;

  if (req.userRole === 'admin') {
    const p = loadAdminProfile();
    displayName = p.displayName || null;
    timezone    = p.timezone    || null;
    if (p.avatarExt) avatarUrl = `/api/me/avatar`;
  } else {
    const users = loadUsers();
    const user  = users.find((u) => u.id === req.userId);
    workspaceRole = user?.workspaceRole || 'producer';
    displayName   = user?.displayName   || null;
    timezone      = user?.timezone      || null;
    if (user?.avatarExt) avatarUrl = `/api/me/avatar`;
  }

  res.json({ userId: req.userId, username: req.username, role: req.userRole,
             workspaceRole, displayName, timezone, avatarUrl });
});

// ── User: update own profile (workspaceRole, displayName, timezone) ───────────
app.patch('/api/me', (req, res) => {
  const { workspaceRole, displayName, timezone } = req.body || {};

  if (req.userRole === 'admin') {
    const p = loadAdminProfile();
    if (displayName !== undefined) p.displayName = String(displayName).trim().slice(0, 100);
    if (timezone    !== undefined) p.timezone    = String(timezone).slice(0, 60);
    saveAdminProfile(p);
    return res.json({ ok: true, workspaceRole: 'producer',
                      displayName: p.displayName || null, timezone: p.timezone || null });
  }

  const users = loadUsers();
  const user  = users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (workspaceRole !== undefined && ['producer', 'backliner'].includes(workspaceRole)) {
    user.workspaceRole = workspaceRole;
  }
  if (displayName !== undefined) user.displayName = String(displayName).trim().slice(0, 100);
  if (timezone    !== undefined) user.timezone    = String(timezone).slice(0, 60);

  saveUsers(users);
  res.json({ ok: true, workspaceRole: user.workspaceRole || 'producer',
             displayName: user.displayName || null, timezone: user.timezone || null });
});

// ── User: avatar upload / serve ───────────────────────────────────────────────
app.post('/api/me/avatar', async (req, res) => {
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid avatar data' });
  }
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Invalid data URL format' });

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1].slice(0, 8);
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'Avatar must be under 2 MB' });

  const avatarDir = path.join(DATA_DIR, 'avatars');
  await fsp.mkdir(avatarDir, { recursive: true });

  // Remove any previous avatar files for this user
  try {
    const files = await fsp.readdir(avatarDir);
    await Promise.all(
      files
        .filter((f) => f.startsWith(`${req.userId}.`))
        .map((f) => fsp.unlink(path.join(avatarDir, f)).catch(() => {}))
    );
  } catch {}

  await fsp.writeFile(path.join(avatarDir, `${req.userId}.${ext}`), buf);

  if (req.userRole === 'admin') {
    const p = loadAdminProfile();
    p.avatarExt = ext;
    saveAdminProfile(p);
  } else {
    const users = loadUsers();
    const user  = users.find((u) => u.id === req.userId);
    if (user) { user.avatarExt = ext; saveUsers(users); }
  }

  res.json({ ok: true, avatarUrl: `/api/me/avatar?t=${Date.now()}` });
});

app.get('/api/me/avatar', async (req, res) => {
  const avatarDir = path.join(DATA_DIR, 'avatars');
  const exts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  for (const ext of exts) {
    const fp = path.join(avatarDir, `${req.userId}.${ext}`);
    try {
      await fsp.access(fp);
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                        gif: 'image/gif', webp: 'image/webp' };
      res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.sendFile(fp);
      return;
    } catch {}
  }
  res.status(404).end();
});

// ── Spotify integration status (server-level credentials) ────────────────────
app.get('/api/spotify/status', (req, res) => {
  res.json({ connected: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) });
});

// ── Change password ───────────────────────────────────────────────────────────
app.post('/api/me/change-password', (req, res) => {
  if (req.userRole === 'admin') {
    return res.status(403).json({ error: 'Admin password is managed via the AUTH_PASSWORD environment variable.' });
  }
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const users = loadUsers();
  const user  = users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  user.passwordHash = hashPassword(newPassword);
  saveUsers(users);
  res.json({ ok: true });
});

// ── 2FA status ────────────────────────────────────────────────────────────────
app.get('/api/me/2fa/status', (req, res) => {
  if (req.userRole === 'admin') {
    const p = loadAdminProfile();
    return res.json({ enabled: !!(p.twoFactorEnabled && p.twoFactorSecret) });
  }
  const user = loadUsers().find((u) => u.id === req.userId);
  res.json({ enabled: !!(user?.twoFactorEnabled && user?.twoFactorSecret) });
});

// ── 2FA setup — generate secret (not yet saved) ───────────────────────────────
app.post('/api/me/2fa/setup', (req, res) => {
  const secret     = generateTotpSecret();
  const otpauthUri = buildOtpAuthUri(secret, req.username || 'user');
  res.json({ secret, otpauthUri });
});

// ── 2FA enable — verify code then persist ────────────────────────────────────
app.post('/api/me/2fa/enable', (req, res) => {
  const { secret, code } = req.body || {};
  if (!secret || !code) return res.status(400).json({ error: 'secret and code are required' });
  if (!verifyTotp(secret, code)) {
    return res.status(401).json({ error: 'Invalid code — check your authenticator app and try again' });
  }
  if (req.userRole === 'admin') {
    const p = loadAdminProfile();
    p.twoFactorSecret  = secret;
    p.twoFactorEnabled = true;
    saveAdminProfile(p);
  } else {
    const users = loadUsers();
    const user  = users.find((u) => u.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.twoFactorSecret  = secret;
    user.twoFactorEnabled = true;
    saveUsers(users);
  }
  res.json({ ok: true });
});

// ── 2FA disable — verify current code then remove ────────────────────────────
app.post('/api/me/2fa/disable', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Verification code required' });

  let secret = null;
  if (req.userRole === 'admin') {
    const p = loadAdminProfile();
    secret = p.twoFactorEnabled ? p.twoFactorSecret : null;
  } else {
    const user = loadUsers().find((u) => u.id === req.userId);
    secret = user?.twoFactorEnabled ? user?.twoFactorSecret : null;
  }

  if (!secret) return res.status(400).json({ error: '2FA is not enabled' });
  if (!verifyTotp(secret, code)) return res.status(401).json({ error: 'Invalid code' });

  if (req.userRole === 'admin') {
    const p = loadAdminProfile();
    p.twoFactorEnabled = false;
    p.twoFactorSecret  = null;
    saveAdminProfile(p);
  } else {
    const users = loadUsers();
    const user  = users.find((u) => u.id === req.userId);
    if (user) { user.twoFactorEnabled = false; user.twoFactorSecret = null; saveUsers(users); }
  }
  res.json({ ok: true });
});

// ── Admin: Teams (groups) management ─────────────────────────────────────────
app.get('/api/admin/teams', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json(loadTeams());
});

app.post('/api/admin/teams', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, members = [], sharedArtists = [] } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const team = { id: uuidv4(), name: name.trim(), members, sharedArtists, createdAt: new Date().toISOString() };
  const teams = loadTeams();
  teams.push(team);
  saveTeams(teams);
  res.status(201).json(team);
});

app.patch('/api/admin/teams/:id', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, members, sharedArtists } = req.body || {};
  const teams = loadTeams();
  const team  = teams.find((t) => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  if (name            !== undefined) team.name          = name.trim();
  if (Array.isArray(members))        team.members       = members;
  if (Array.isArray(sharedArtists))  team.sharedArtists = sharedArtists;
  saveTeams(teams);
  res.json({ ok: true, team });
});

app.delete('/api/admin/teams/:id', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const teams = loadTeams();
  const idx   = teams.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Team not found' });
  teams.splice(idx, 1);
  saveTeams(teams);
  res.status(204).send();
});

// ── Teams: non-admin user gets their teams with shared show data ──────────────
app.get('/api/teams', async (req, res) => {
  if (req.userRole === 'admin') return res.json(loadTeams());

  // Auto-apply default viewer access for users who accepted a join request
  // but whose team-settings entry was never written (e.g., accepted before this fix).
  const accepted = loadJoinRequests().find(
    (r) => r.toUserId === req.userId && r.status === 'accepted'
  );
  if (accepted) {
    const settings = loadTeamSettings();
    if (!(settings.userArtistAccess || {})[req.userId]) {
      const adminArtists = await readJsonCached(
        udCacheKey('admin', 'artists'),
        udDataPath('admin', 'artists.json'),
        []
      ).catch(() => []);
      const uaa = settings.userArtistAccess || {};
      uaa[req.userId] = Object.fromEntries(
        adminArtists.map((a) => [a.id, { role: 'viewer' }])
      );
      settings.userArtistAccess = uaa;
      saveTeamSettings(settings);
    }
  }

  const myTeams   = loadTeams().filter((t) => (t.members || []).includes(req.userId));
  const settings  = loadTeamSettings();
  const accessMap = normalizeUserAccess(settings, req.userId);
  const directIds = Object.keys(accessMap);

  if (!myTeams.length && !directIds.length) return res.json([]);

  const adminArtists = await readJsonCached(
    udCacheKey('admin', 'artists'),
    udDataPath('admin', 'artists.json'),
    []
  ).catch(() => []);

  // Named-group results
  const result = await Promise.all(myTeams.map(async (team) => {
    const artistsData = await Promise.all((team.sharedArtists || []).map(async ({ artistId, visibleRubrics = [] }) => {
      const artist = adminArtists.find((a) => a.id === artistId) || { id: artistId, name: '—' };
      const uid    = artistScopedId('admin', artistId);
      const shows  = await readJsonCached(udCacheKey(uid, 'shows'), udDataPath(uid, 'shows.json'), []).catch(() => []);
      return { artistId, artistName: artist.name, visibleRubrics, shows };
    }));
    return { id: team.id, name: team.name, artistsData };
  }));

  // Direct-access artists (from userArtistAccess) not already covered by a named group
  if (directIds.length > 0) {
    const covered   = new Set(result.flatMap((t) => (t.artistsData || []).map((a) => a.artistId)));
    const remaining = directIds.filter((id) => !covered.has(id));
    if (remaining.length > 0) {
      const directData = await Promise.all(remaining.map(async (artistId) => {
        const artist  = adminArtists.find((a) => a.id === artistId) || { id: artistId, name: '—' };
        const uid     = artistScopedId('admin', artistId);
        const shows   = await readJsonCached(udCacheKey(uid, 'shows'), udDataPath(uid, 'shows.json'), []).catch(() => []);
        const access  = accessMap[artistId] || {};
        return {
          artistId,
          artistName:     artist.name,
          role:           access.role           || 'viewer',
          visibleRubrics: access.visibleRubrics || [],
          shows,
        };
      }));
      result.push({ id: '__direct__', name: null, artistsData: directData });
    }
  }

  // Log content view — deduplicated: one entry per user per 10 minutes
  const recentView = loadActivity().find(
    (e) => e.userId === req.userId && e.action === 'view_teams' &&
      Date.now() - new Date(e.timestamp).getTime() < 10 * 60 * 1000
  );
  if (!recentView && result.length > 0) {
    const artistNames = [...new Set(
      result.flatMap((t) => (t.artistsData || []).map((a) => a.artistName))
    )].filter(Boolean).join(', ');
    logActivity(req.userId, req.username, 'view_teams', artistNames || 'shared content');
  }

  res.json(result);
});

// ── Admin-only: user management ───────────────────────────────────────────────
app.get('/api/users', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const users = loadUsers().map(({ id, username, email, role, workspaceRole, assignedShowIds, createdAt }) => ({
    id, username, email: email || null, role,
    workspaceRole: workspaceRole || 'producer',
    assignedShowIds: assignedShowIds || [],
    createdAt,
  }));
  res.json(users);
});

app.delete('/api/users/:id', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const users = loadUsers();
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  users.splice(idx, 1);
  saveUsers(users);
  res.status(204).send();
});

// ── Admin: data restore (temporary — remove after recovery) ──────────────────
// Accepts a full data dump (JSON files as strings) and writes them to DATA_DIR.
// Protected by the existing admin-only auth middleware.
app.post('/api/admin/restore-data', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { files } = req.body || {};
    if (!files || typeof files !== 'object') return res.status(400).json({ error: 'files object required' });
    let written = 0;
    for (const [relPath, content] of Object.entries(files)) {
      // Sanitise path — no traversal outside DATA_DIR
      const safe = relPath.replace(/\.\.\//g, '').replace(/^\//, '');
      const dest = path.join(DATA_DIR, safe);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8');
      written++;
    }
    clearCache(); // flush stale in-memory cache so next reads come from disk
    res.json({ ok: true, written });
  } catch (err) {
    console.error('[restore]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: team settings (RBAC) ───────────────────────────────────────────────
app.get('/api/admin/settings', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json(loadTeamSettings());
});

app.post('/api/admin/settings', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { visibleRubrics, userArtistAccess, userPermissions } = req.body || {};
  const current = loadTeamSettings();
  const updated = {
    visibleRubrics:   Array.isArray(visibleRubrics)   ? visibleRubrics   : current.visibleRubrics,
    userArtistAccess: userArtistAccess && typeof userArtistAccess === 'object'
      ? userArtistAccess : current.userArtistAccess,
    userPermissions: userPermissions && typeof userPermissions === 'object'
      ? userPermissions : (current.userPermissions || {}),
  };
  saveTeamSettings(updated);
  res.json({ ok: true, settings: updated });
});

// ── Admin: Google Drive diagnostic ───────────────────────────────────────────
app.get('/api/admin/google-status', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { google: googleLib } = require('googleapis');
  const volumeCredsPath = path.join(DATA_DIR, 'gmail-credentials.json');
  const volumeTokenPath = path.join(DATA_DIR, 'gmail-token.json');
  const staticCredsPath = path.join(__dirname, 'data/gmail-credentials.json');
  const staticTokenPath = path.join(__dirname, 'data/gmail-token.json');

  const result = {
    DATA_DIR,
    sources: {
      creds: fs.existsSync(volumeCredsPath) ? 'volume' : process.env.GMAIL_CREDENTIALS ? 'env_var' : fs.existsSync(staticCredsPath) ? 'static_file' : 'MISSING',
      token: fs.existsSync(volumeTokenPath) ? 'volume' : process.env.GMAIL_TOKEN ? 'env_var' : fs.existsSync(staticTokenPath) ? 'static_file' : 'MISSING',
    },
    tokenInfo: null, driveTest: null, error: null,
  };

  try {
    let creds, tokens;
    if (fs.existsSync(volumeCredsPath))      creds  = JSON.parse(fs.readFileSync(volumeCredsPath, 'utf8'));
    else if (process.env.GMAIL_CREDENTIALS)  creds  = JSON.parse(process.env.GMAIL_CREDENTIALS);
    else                                      creds  = JSON.parse(fs.readFileSync(staticCredsPath, 'utf8'));
    if (fs.existsSync(volumeTokenPath))      tokens = JSON.parse(fs.readFileSync(volumeTokenPath, 'utf8'));
    else if (process.env.GMAIL_TOKEN)        tokens = JSON.parse(process.env.GMAIL_TOKEN);
    else                                      tokens = JSON.parse(fs.readFileSync(staticTokenPath, 'utf8'));

    result.tokenInfo = {
      has_access_token:  !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      scope:             tokens.scope || null,
      expiry_date:       tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      expired:           tokens.expiry_date ? tokens.expiry_date < Date.now() : 'unknown',
    };

    const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
    const client = new googleLib.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    client.setCredentials(tokens);

    // Pre-fetch to force credential resolution (fixes Node 20 auth injection)
    try {
      const { token: freshToken } = await client.getAccessToken();
      if (freshToken) {
        client.setCredentials({ ...tokens, access_token: freshToken });
        result.tokenInfo.prefetch = 'ok';
      }
    } catch (e) {
      result.tokenInfo.prefetch_error = e.message;
    }

    // Test: get user info
    const oauth2 = googleLib.oauth2({ version: 'v2', auth: client });
    const uinfo = await oauth2.userinfo.get();
    result.tokenInfo.email = uinfo.data.email;

    // Test: access the template doc
    const TMPL = process.env.TEMPLATE_DOC_ID || '1ZBXxhG14W91wBKdvW96Qu8-kQmIX2ZpNY58psVsqhDs';
    const drive = googleLib.drive({ version: 'v3', auth: client });
    const meta  = await drive.files.get({ fileId: TMPL, fields: 'id,name,owners' });
    result.driveTest = { ok: true, fileName: meta.data.name, templateId: TMPL };
  } catch (err) {
    result.error = err.message;
  }

  res.json(result);
});

// ── Admin: push a fresh Google token to the DATA_DIR volume ─────────────────
app.post('/api/admin/google-token', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const token = req.body;
  if (!token || !token.access_token || !token.refresh_token) {
    return res.status(400).json({ error: 'Body must be a Google token JSON with access_token and refresh_token' });
  }
  try {
    const dest = path.join(DATA_DIR, 'gmail-token.json');
    await fsp.writeFile(dest, JSON.stringify(token, null, 2), 'utf8');
    console.log('[admin] Google token updated at', dest);
    res.json({ ok: true, written: dest });
  } catch (err) {
    console.error('[admin] Failed to write Google token:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: push Google OAuth credentials (client_id/secret) to the volume ───
// Must be pushed alongside the token so getGoogleAuth() uses a matching pair.
app.post('/api/admin/google-credentials', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const creds = req.body;
  if (!creds || (!creds.installed && !creds.web)) {
    return res.status(400).json({ error: 'Body must be a Google credentials JSON with installed or web key' });
  }
  try {
    const dest = path.join(DATA_DIR, 'gmail-credentials.json');
    await fsp.writeFile(dest, JSON.stringify(creds, null, 2), 'utf8');
    console.log('[admin] Google credentials updated at', dest);
    res.json({ ok: true, written: dest });
  } catch (err) {
    console.error('[admin] Failed to write Google credentials:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: invitation management ─────────────────────────────────────────────
app.get('/api/invitations', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  // Return all invitations, enriching usedBy with username for display
  const invitations = loadInvitations();
  const users       = loadUsers();
  const result = invitations.map((inv) => {
    const usedByUser = inv.usedBy ? users.find((u) => u.id === inv.usedBy) : null;
    return { ...inv, usedByUsername: usedByUser?.username || null };
  });
  res.json(result);
});

app.post('/api/invitations/generate', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { workspaceRole } = req.body || {};
  const token      = uuidv4();
  const expiresAt  = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h
  const invitation = {
    token, createdAt: new Date().toISOString(), expiresAt, usedBy: null,
    workspaceRole: workspaceRole === 'backliner' ? 'backliner' : 'producer',
  };
  const invitations = loadInvitations();
  invitations.push(invitation);
  saveInvitations(invitations);
  const link = `${req.protocol}://${req.get('host')}/register?token=${token}`;
  res.json({ ok: true, token, link, expiresAt, workspaceRole: invitation.workspaceRole });
});

app.delete('/api/invitations/:token', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const invitations = loadInvitations();
  const filtered = invitations.filter((i) => i.token !== req.params.token);
  if (filtered.length === invitations.length) return res.status(404).json({ error: 'Not found' });
  saveInvitations(filtered);
  res.status(204).send();
});

// ── Join requests (admin → user) ─────────────────────────────────────────────
// POST /api/team/join-request  — admin sends a request to a user by username
app.post('/api/team/join-request', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { username } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ error: 'username required' });
  const users = loadUsers();
  const target = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!target) return res.status(404).json({ error: `No user found with username "${username}"` });
  const requests = loadJoinRequests();
  const existing = requests.find((r) => r.toUserId === target.id && r.status === 'pending');
  if (existing) return res.status(409).json({ error: `A pending request already exists for "${target.username}"` });
  const fromUsername = process.env.AUTH_USER || 'Admin';
  const req_ = {
    id: uuidv4(),
    fromUsername,
    toUserId: target.id,
    toUsername: target.username,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  requests.push(req_);
  saveJoinRequests(requests);
  res.status(201).json({ ok: true, request: req_ });
});

// GET /api/team/join-requests — admin sees all outgoing requests
app.get('/api/team/join-requests', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json(loadJoinRequests());
});

// DELETE /api/team/join-request/:id — admin cancels a pending request
app.delete('/api/team/join-request/:id', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const requests = loadJoinRequests();
  const filtered = requests.filter((r) => r.id !== req.params.id);
  if (filtered.length === requests.length) return res.status(404).json({ error: 'Not found' });
  saveJoinRequests(filtered);
  res.status(204).send();
});

// GET /api/me/join-requests — authenticated user fetches their pending requests
app.get('/api/me/join-requests', (req, res) => {
  if (!req.userId || req.userId === 'admin') return res.json([]);
  const uid = req.userId;
  const pending = loadJoinRequests().filter((r) => r.toUserId === uid && r.status === 'pending');
  res.json(pending);
});

// POST /api/me/join-requests/:id/accept
app.post('/api/me/join-requests/:id/accept', async (req, res) => {
  if (!req.userId || req.userId === 'admin') return res.status(403).json({ error: 'Not available' });
  const requests = loadJoinRequests();
  const r = requests.find((r) => r.id === req.params.id && r.toUserId === req.userId);
  if (!r) return res.status(404).json({ error: 'Request not found' });
  r.status = 'accepted';
  r.respondedAt = new Date().toISOString();
  saveJoinRequests(requests);

  // Grant viewer access to all of the admin's current artists in team-settings
  try {
    const adminArtists = await readJsonCached(
      udCacheKey('admin', 'artists'),
      udDataPath('admin', 'artists.json'),
      []
    ).catch(() => []);
    const settings = loadTeamSettings();
    const uaa = settings.userArtistAccess || {};
    if (!uaa[req.userId]) {
      // Build an object with viewer access to every admin artist
      uaa[req.userId] = Object.fromEntries(
        adminArtists.map((a) => [a.id, { role: 'viewer' }])
      );
      settings.userArtistAccess = uaa;
      saveTeamSettings(settings);
    }
  } catch (e) {
    console.error('[accept join-request] could not grant artist access:', e.message);
  }

  res.json({ ok: true });
});

// POST /api/me/join-requests/:id/decline
app.post('/api/me/join-requests/:id/decline', (req, res) => {
  if (!req.userId || req.userId === 'admin') return res.status(403).json({ error: 'Not available' });
  const requests = loadJoinRequests();
  const r = requests.find((r) => r.id === req.params.id && r.toUserId === req.userId);
  if (!r) return res.status(404).json({ error: 'Request not found' });
  r.status = 'declined';
  r.respondedAt = new Date().toISOString();
  saveJoinRequests(requests);
  res.json({ ok: true });
});

// ── Team member: accessible artists ──────────────────────────────────────────
// Non-admin users call this to discover which admin artists they can view.
app.get('/api/team/artists', async (req, res) => {
  if (req.userRole === 'admin') return res.json([]);
  const settings  = loadTeamSettings();
  const accessMap = normalizeUserAccess(settings, req.userId);
  const permittedIds = Object.keys(accessMap);
  if (!permittedIds.length) return res.json([]);
  // Load admin's artists list
  const adminArtists = await readJsonCached(
    udCacheKey('admin', 'artists'),
    udDataPath('admin', 'artists.json'),
    []
  );
  const permitted = adminArtists
    .filter((a) => permittedIds.includes(a.id))
    .map((a) => ({ ...a, role: accessMap[a.id]?.role || 'viewer' }));
  res.json(permitted);
});

// ── Artist management (uses real req.userId — must be before scope middleware) ─
app.use('/api/artists', artistsRouter);

// ── Artist-scope middleware ───────────────────────────────────────────────────
// If a request carries ?artistId=<id>, verify it belongs to the current user
// and rewrite req.userId to the compound scoped key so every downstream route
// automatically reads/writes artist-isolated data without any route changes.
app.use('/api', async (req, res, next) => {
  const artistId = req.query.artistId;
  if (!artistId) return next();
  // Never scope the artists-management routes themselves
  if (req.originalUrl.startsWith('/api/artists')) return next();
  try {
    const artists = await readJsonCached(
      udCacheKey(req.userId, 'artists'),
      udDataPath(req.userId, 'artists.json'),
      []
    );
    if (artists.some((a) => a.id === artistId)) {
      req.userId = `${req.userId}__art__${artistId}`;
    }
  } catch { /* leave req.userId unchanged on any read error */ }
  next();
});

// ── Team: activity log ───────────────────────────────────────────────────────
app.get('/api/team/activity', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json(loadActivity());
});

// ── Team: notify (broadcast email to team members with email on file) ─────────
app.post('/api/team/notify', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { subject, message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  const users      = loadUsers();
  const recipients = users.filter((u) => u.email && u.email.includes('@'));
  if (!recipients.length) {
    return res.status(400).json({ error: 'No team members have an email address on file.' });
  }
  if (!gmailConfigured()) {
    return res.status(503).json({ error: 'Gmail not configured on this server.' });
  }

  const emailSubject = subject?.trim() || 'Message from Production Hub';
  const results = [];
  for (const u of recipients) {
    try {
      await sendGmail(u.email, emailSubject, message.trim());
      results.push({ username: u.username, email: u.email, ok: true });
    } catch (e) {
      results.push({ username: u.username, email: u.email, ok: false, error: e.message });
    }
  }
  const sent   = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  logActivity('admin', 'admin', 'notify', `Sent "${emailSubject}" to ${sent} member(s)`);
  res.json({ ok: true, sent, failed, results });
});

// ── Admin: patch user email / role / workspaceRole / assignedShowIds ─────────
app.patch('/api/users/:id', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { email, role, workspaceRole, assignedShowIds } = req.body || {};
  const users = loadUsers();
  const user  = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (email           !== undefined) user.email           = email?.trim() || null;
  if (role            !== undefined && ['guest', 'user'].includes(role)) user.role = role;
  if (workspaceRole   !== undefined && ['producer', 'backliner'].includes(workspaceRole)) {
    user.workspaceRole = workspaceRole;
  }
  if (Array.isArray(assignedShowIds)) user.assignedShowIds = assignedShowIds;
  saveUsers(users);
  res.json({
    ok: true,
    user: {
      id: user.id, username: user.username, email: user.email,
      role: user.role, workspaceRole: user.workspaceRole || 'producer',
      assignedShowIds: user.assignedShowIds || [],
    },
  });
});

// ── Team member: controlled show write ───────────────────────────────────────
// Team members update specific fields (checklist, setlist, techFiles) on admin's
// shows they have edit rights for.  They never get req.userId rewritten to admin.
app.patch('/api/team/show/:artistId/:showId', async (req, res) => {
  if (req.userRole === 'admin') return res.status(400).json({ error: 'Use /api/shows for admin edits' });
  const { artistId, showId } = req.params;
  const settings   = loadTeamSettings();
  const accessMap  = normalizeUserAccess(settings, req.userId);
  const access     = accessMap[artistId];
  if (!access) return res.status(403).json({ error: 'No access to this artist' });

  // Fields a team member may write — always allow backline fields; respect editRubrics for others
  const ALWAYS_EDITABLE = new Set(['checklist', 'setlist', 'techFiles']);
  const editableRubrics = new Set(access.editRubrics || []);

  const uid   = artistScopedId('admin', artistId);
  const shows = await readJsonCached(udCacheKey(uid, 'shows'), udDataPath(uid, 'shows.json'), []);
  const idx   = shows.findIndex((s) => s.id === showId);
  if (idx === -1) return res.status(404).json({ error: 'Show not found' });

  const patch = {};
  for (const [key, val] of Object.entries(req.body || {})) {
    if (ALWAYS_EDITABLE.has(key) || editableRubrics.has(key)) patch[key] = val;
  }

  const updated = { ...shows[idx], ...patch };
  shows[idx] = updated;
  await writeJsonAndCache(udCacheKey(uid, 'shows'), udDataPath(uid, 'shows.json'), shows);
  logActivity(req.userId, req.username, 'update_show', shows[idx].name || showId);
  res.json(updated);
});

// ── Team member: toggle an assigned task ────────────────────────────────────
app.patch('/api/tasks/assigned/:artistId/:id', async (req, res) => {
  if (req.userRole === 'admin') return res.status(400).json({ error: 'Use /api/tasks for admin' });
  const { artistId, id } = req.params;
  const settings  = loadTeamSettings();
  const accessMap = normalizeUserAccess(settings, req.userId);
  if (!accessMap[artistId]) return res.status(403).json({ error: 'No access to this artist' });

  const uid   = artistScopedId('admin', artistId);
  const tasks = await readJsonCached(udCacheKey(uid, 'tasks'), udDataPath(uid, 'tasks.json'), []);
  const idx   = tasks.findIndex((t) => t.id === id && t.assigneeId === req.userId);
  if (idx === -1) return res.status(404).json({ error: 'Task not found or not assigned to you' });

  const updated = { ...tasks[idx], ...req.body, id: tasks[idx].id };
  tasks[idx] = updated;
  await writeJsonAndCache(udCacheKey(uid, 'tasks'), udDataPath(uid, 'tasks.json'), tasks);
  res.json(updated);
});

// ── Non-admin GET /api/tasks: own tasks + tasks assigned from team artists ────
app.get('/api/tasks', async (req, res, next) => {
  if (req.userRole === 'admin') return next(); // admin handled by tasksRouter
  try {
    const ownTasks  = await readJsonCached(
      udCacheKey(req.userId, 'tasks'),
      udDataPath(req.userId, 'tasks.json'),
      []
    );
    const settings  = loadTeamSettings();
    const accessMap = normalizeUserAccess(settings, req.userId);
    const artistIds = Object.keys(accessMap);

    const assignedGroups = await Promise.all(artistIds.map(async (artistId) => {
      const uid   = artistScopedId('admin', artistId);
      const tasks = await readJsonCached(
        udCacheKey(uid, 'tasks'),
        udDataPath(uid, 'tasks.json'),
        []
      ).catch(() => []);
      return tasks
        .filter((t) => t.assigneeId === req.userId)
        .map((t) => ({ ...t, assignedToMe: true, fromArtistId: artistId }));
    }));

    res.json([...ownTasks, ...assignedGroups.flat()]);
  } catch (err) { next(err); }
});

// ── API routers ──────────────────────────────────────────────────────────────
app.use('/api/shows',          showsRouter);
app.use('/api/documents',      documentsRouter);
app.use('/api/crew',           crewRouter);
app.use('/api/templates',      templatesRouter);
app.use('/api/event-types',    eventTypesRouter);
app.use('/api/roles',          rolesRouter);
app.use('/api/field-templates',fieldTemplatesRouter);
app.use('/api/import',         importRouter);
app.use('/api/calendar',       calendarRouter);
app.use('/api/tasks',          tasksRouter);
app.use('/api/spotify',        spotifyRouter);
app.use('/api/drive',          driveRouter);
app.use('/api/automations',    automationsRouter);
app.use('/api/tools',          techSpecRouter);

// ── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, '—', err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ── Static React app ─────────────────────────────────────────────────────────
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// ── File watcher: auto-import xlsx ───────────────────────────────────────────
const SHOWS_FILE = path.join(DATA_DIR, 'shows.json');

async function autoImport(xlsxPath) {
  try {
    const existing = await readJsonCached('shows', SHOWS_FILE, []);
    const newShows = findNewShows(xlsxPath, existing);
    if (newShows.length > 0) {
      await writeJsonAndCache('shows', SHOWS_FILE, [...existing, ...newShows]);
      console.log(`[import] Auto-imported ${newShows.length} new shows from ${path.basename(xlsxPath)}`);
    } else {
      console.log('[import] No new shows found in updated file.');
    }
  } catch (err) {
    console.error('[import] Auto-import failed:', err.message);
  }
}

if (fs.existsSync(DEFAULT_XLSX)) {
  chokidar
    .watch(DEFAULT_XLSX, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 1500 } })
    .on('change', (p) => {
      console.log(`[import] Detected change in ${path.basename(p)} — syncing shows...`);
      autoImport(p);
    });
  console.log(`[import] Watching for changes: ${path.basename(DEFAULT_XLSX)}`);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function gracefulExit(signal) {
  console.log(`\n[server] ${signal} received — shutting down…`);
  await shutdownPuppeteer().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => gracefulExit('SIGTERM'));
process.on('SIGINT',  () => gracefulExit('SIGINT'));

// ── Startup migration: copy root data into any empty artist directories ───────
// Runs on every boot. Safe & idempotent — only copies if the artist file is
// empty/missing and the root file has actual content.
async function migrateRootDataToArtists() {
  try {
    const artistsFile = path.join(DATA_DIR, 'artists.json');
    if (!fs.existsSync(artistsFile)) return;

    const artists = JSON.parse(await fsp.readFile(artistsFile, 'utf8'));
    if (!artists.length) return;

    const fileDefs = [
      { file: 'shows.json',          empty: [] },
      { file: 'crew.json',           empty: [] },
      { file: 'event-types.json',    empty: [] },
      { file: 'roles.json',          empty: [] },
      { file: 'field-templates.json',empty: {} },
      { file: 'templates.json',      empty: {} },
    ];

    for (const artist of artists) {
      const artistDir = path.join(DATA_DIR, 'artists', artist.id);
      await fsp.mkdir(artistDir, { recursive: true });

      let migratedCount = 0;
      for (const { file, empty } of fileDefs) {
        const dst = path.join(artistDir, file);
        const src = path.join(DATA_DIR, file);

        // Read current artist file (default to empty if missing)
        let artistData = empty;
        try { artistData = JSON.parse(await fsp.readFile(dst, 'utf8')); } catch {}
        const isEmpty = Array.isArray(artistData)
          ? artistData.length === 0
          : Object.keys(artistData).length === 0;
        if (!isEmpty) continue; // already has data — skip

        // Read root file
        let srcContent;
        try { srcContent = await fsp.readFile(src, 'utf8'); } catch { continue; }
        const srcData = JSON.parse(srcContent);
        const hasContent = Array.isArray(srcData)
          ? srcData.length > 0
          : Object.keys(srcData).length > 0;
        if (!hasContent) continue;

        // Copy root → artist, then invalidate cache
        await fsp.writeFile(dst, srcContent);
        // Invalidate in-memory cache so next read gets fresh data
        const { invalidate } = require('./cache');
        if (typeof invalidate === 'function') {
          const baseName = file.replace('.json', '');
          invalidate(`${baseName}:art:${artist.id}`);
        }
        migratedCount++;
        console.log(`[migrate] ${file} → ${artist.name}`);
      }
      if (migratedCount > 0) {
        console.log(`[migrate] Copied ${migratedCount} root file(s) to artist "${artist.name}" (${artist.id})`);
      }
    }
  } catch (e) {
    console.warn('[migrate] startup migration skipped:', e.message);
  }
}

app.listen(PORT, () => {
  const networkIp = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i.family === 'IPv4' && !i.internal)?.address || 'unknown';

  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│  Production Hub is running                  │');
  console.log('│                                             │');
  console.log(`│  Local:   http://localhost:${PORT}           │`);
  console.log(`│  Network: http://${networkIp}:${PORT}        │`);
  console.log('│                                             │');
  console.log(`│  Login: ${AUTH_USER} / (see server/.env)         │`);
  console.log('│  Demo:  /demo  (no login required)          │');
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
  // Storage diagnostics — check Railway logs after deploy to verify volume is mounted
  console.log('[storage] DATA_DIR:', DATA_DIR);
  try {
    const entries = fs.readdirSync(DATA_DIR);
    console.log('[storage] contents:', entries.join(', ') || '(empty)');
    const artistsDir = path.join(DATA_DIR, 'artists');
    if (fs.existsSync(artistsDir)) {
      const artistDirs = fs.readdirSync(artistsDir);
      console.log('[storage] artists:', artistDirs.join(', ') || '(none)');
    } else {
      console.log('[storage] artists dir: not found');
    }
  } catch (e) {
    console.log('[storage] read error:', e.message);
  }
  migrateRootDataToArtists(); // fire-and-forget — non-blocking
  startGmailPolling();
  startAutomationsCron();    // daily 09:00 early-coordination alerts
});

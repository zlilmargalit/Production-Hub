require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express  = require('express');
const cors     = require('cors');
const fs       = require('fs');
const fsp      = require('fs').promises;
const path     = require('path');
const os       = require('os');
const chokidar = require('chokidar');
const { v4: uuidv4 } = require('uuid');

const {
  COOKIE_NAME, signToken, getAuthUser, checkAuthed,
  cookieOptions, verifyCredentials, hashPassword,
  loadUsers, saveUsers,
} = require('./auth');
const loginPage = require('./login-page');

const showsRouter         = require('./routes/shows');
const documentsRouter     = require('./routes/documents');
const crewRouter          = require('./routes/crew');
const templatesRouter     = require('./routes/templates');
const eventTypesRouter    = require('./routes/event-types');
const fieldTemplatesRouter= require('./routes/field-templates');
const { router: importRouter, findNewShows, DEFAULT_XLSX } = require('./routes/import');
const calendarRouter      = require('./routes/calendar');
const { startPolling: startGmailPolling } = require('./gmail-poll');
const { readJsonCached, writeJsonAndCache } = require('./cache');
const { shutdown: shutdownPuppeteer } = require('./pdf');
const { ensureUserDir } = require('./utils/userData');

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
  res.type('html').send(loginPage({ error: req.query.error === '1' }));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const authUser = verifyCredentials(username, password);
  if (authUser) {
    res.cookie(COOKIE_NAME, signToken(authUser), cookieOptions(req));
    return res.redirect('/');
  }
  res.status(401).type('html').send(loginPage({ error: true, username }));
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

// ── Who-am-I (after auth gate) ───────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  res.json({ userId: req.userId, username: req.username, role: req.userRole });
});

// ── Admin-only: user management ───────────────────────────────────────────────
app.get('/api/users', (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const users = loadUsers().map(({ id, username, role, createdAt }) => ({ id, username, role, createdAt }));
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

// ── API routers ──────────────────────────────────────────────────────────────
app.use('/api/shows',          showsRouter);
app.use('/api/documents',      documentsRouter);
app.use('/api/crew',           crewRouter);
app.use('/api/templates',      templatesRouter);
app.use('/api/event-types',    eventTypesRouter);
app.use('/api/field-templates',fieldTemplatesRouter);
app.use('/api/import',         importRouter);
app.use('/api/calendar',       calendarRouter);

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
const SHOWS_FILE = path.join(__dirname, 'data/shows.json');

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
  startGmailPolling();
});

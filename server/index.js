// Load .env from server/.env (takes precedence over the parent process env
// only for keys not already set — Railway env vars still win).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const chokidar = require('chokidar');

const { COOKIE_NAME, signToken, checkAuthed, cookieOptions } = require('./auth');
const loginPage = require('./login-page');

const showsRouter = require('./routes/shows');
const documentsRouter = require('./routes/documents');
const crewRouter = require('./routes/crew');
const templatesRouter = require('./routes/templates');
const eventTypesRouter = require('./routes/event-types');
const fieldTemplatesRouter = require('./routes/field-templates');
const { router: importRouter, findNewShows, DEFAULT_XLSX } = require('./routes/import');
const calendarRouter = require('./routes/calendar');
const { startPolling: startGmailPolling } = require('./gmail-poll');
const { readJsonCached, writeJsonAndCache } = require('./cache');
const { shutdown: shutdownPuppeteer } = require('./pdf');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Auth ────────────────────────────────────────────────────────────────────
// A single shared username/password protects the whole site (API + frontend).
// Credentials come from .env (AUTH_USER / AUTH_PASSWORD) — refuse to start if
// the password is left at the placeholder so we never deploy "change-me".
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

// Railway/Heroku-style proxy → trust X-Forwarded-Proto so cookies get `secure`
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false })); // for /login POST

// ── Public routes (must be declared BEFORE the auth middleware) ────────────
// Health check stays public so PaaS uptime probes don't trigger auth.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Login page
app.get('/login', (req, res) => {
  // If already authed, bounce to home
  if (checkAuthed(req)) return res.redirect('/');
  res.type('html').send(loginPage({ error: req.query.error === '1' }));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === AUTH_USER && password === AUTH_PASSWORD) {
    res.cookie(COOKIE_NAME, signToken(username), cookieOptions(req));
    return res.redirect('/');
  }
  // Wrong credentials — re-show the page with an error flag
  res.status(401).type('html').send(loginPage({ error: true, username }));
});

app.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.redirect('/login');
});

// PWA assets that the login page references must be public too
app.get(['/manifest.json', '/apple-touch-icon.png', '/icon-180.png', '/icon-192.png', '/icon-512.png'], (req, res, next) => {
  const file = path.join(__dirname, '../client/dist', req.path);
  if (fs.existsSync(file)) return res.sendFile(file);
  next();
});

// ── Auth gate ──────────────────────────────────────────────────────────────
// Cookie session OR Basic auth header (for curl/scripts). Anything else:
//   - HTML requests → redirect to /login
//   - API requests  → 401 JSON
app.use((req, res, next) => {
  if (checkAuthed(req)) return next();
  if (req.path.startsWith('/api/') || req.xhr || req.get('accept')?.includes('application/json')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  res.redirect('/login');
});

app.use('/api/shows', showsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/crew', crewRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/event-types', eventTypesRouter);
app.use('/api/field-templates', fieldTemplatesRouter);
app.use('/api/import', importRouter);
app.use('/api/calendar', calendarRouter);

// ── Centralised error handler ───────────────────────────────────────────────
// All async route handlers wrap their work in try/catch + next(err); this
// middleware turns any uncaught error into a structured 500 instead of
// leaking the stack trace or hanging the request.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, '—', err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ── Serve built React app ──────────────────────────────────────────────────
const CLIENT_DIST = path.join(__dirname, '../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// ── File watcher: auto-import when the xlsx is replaced ────────────────────
const SHOWS_FILE = path.join(__dirname, 'data/shows.json');

async function autoImport(xlsxPath) {
  try {
    const existing = await readJsonCached('shows', SHOWS_FILE, []);
    const newShows = findNewShows(xlsxPath, existing);
    if (newShows.length > 0) {
      await writeJsonAndCache('shows', SHOWS_FILE, [...existing, ...newShows]);
      console.log(`[import] Auto-imported ${newShows.length} new shows from ${path.basename(xlsxPath)}`);
    } else {
      console.log(`[import] No new shows found in updated file.`);
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

// ── Graceful shutdown ──────────────────────────────────────────────────────
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
  console.log(`│  Production Hub is running                  │`);
  console.log(`│                                             │`);
  console.log(`│  Local:   http://localhost:${PORT}           │`);
  console.log(`│  Network: http://${networkIp}:${PORT}        │`);
  console.log(`│                                             │`);
  console.log(`│  Login: ${AUTH_USER} / (see server/.env)         │`);
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
  startGmailPolling();
});

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
const basicAuth = require('express-basic-auth');

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

const authMiddleware = basicAuth({
  users: { [AUTH_USER]: AUTH_PASSWORD },
  challenge: true,                 // tell browsers to show the login prompt
  realm: 'Production Hub',
  unauthorizedResponse: () => ({ error: 'Authentication required' }),
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '15mb' }));

// Health check stays public so PaaS uptime probes don't trigger auth.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Everything else — API and static frontend — sits behind basic auth.
app.use(authMiddleware);

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

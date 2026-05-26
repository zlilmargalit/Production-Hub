const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const showsRouter = require('./routes/shows');
const documentsRouter = require('./routes/documents');
const crewRouter = require('./routes/crew');
const templatesRouter = require('./routes/templates');
const eventTypesRouter = require('./routes/event-types');
const fieldTemplatesRouter = require('./routes/field-templates');
const { router: importRouter, findNewShows, DEFAULT_XLSX } = require('./routes/import');
const calendarRouter = require('./routes/calendar');
const { startPolling: startGmailPolling } = require('./gmail-poll');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.use('/api/shows', showsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/crew', crewRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/event-types', eventTypesRouter);
app.use('/api/field-templates', fieldTemplatesRouter);
app.use('/api/import', importRouter);
app.use('/api/calendar', calendarRouter);

// ── Serve built React app ─────────────────────────────────────────────────────
const CLIENT_DIST = path.join(__dirname, '../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback — any non-API route serves index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// ── File watcher: auto-import when the xlsx is replaced ──────────────────────
const SHOWS_FILE = path.join(__dirname, 'data/shows.json');

function autoImport(xlsxPath) {
  try {
    const existing = JSON.parse(fs.readFileSync(SHOWS_FILE, 'utf8'));
    const newShows = findNewShows(xlsxPath, existing);
    if (newShows.length > 0) {
      fs.writeFileSync(SHOWS_FILE, JSON.stringify([...existing, ...newShows], null, 2));
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startGmailPolling();
});

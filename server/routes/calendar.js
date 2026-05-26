const express = require('express');
const router  = express.Router();
const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');

const CREDENTIALS_PATH   = path.join(__dirname, '../data/gmail-credentials.json');
const TOKEN_PATH         = path.join(__dirname, '../data/gmail-token.json');
const DATA_FILE          = path.join(__dirname, '../data/shows.json');
const CREW_FILE          = path.join(__dirname, '../data/crew.json');
const CALENDAR_CFG_FILE  = path.join(__dirname, '../data/calendar-config.json');

// Read calendar ID from config file; fall back to 'primary'
function getCalendarId() {
  try {
    return JSON.parse(fs.readFileSync(CALENDAR_CFG_FILE, 'utf8')).calendarId || 'primary';
  } catch {
    return 'primary';
  }
}

function isConfigured() {
  return fs.existsSync(CREDENTIALS_PATH) && fs.existsSync(TOKEN_PATH);
}

function getOAuthClient() {
  const creds  = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  client.setCredentials(tokens);
  client.on('tokens', (newTokens) => {
    const current = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...newTokens }, null, 2));
  });
  return client;
}

// Returns true if two strings share at least 2 words (case-insensitive, ignoring short words ≤1 char)
function sharesTwoWords(a, b) {
  const words = (s) => s.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const setA = new Set(words(a));
  let count = 0;
  for (const w of words(b)) {
    if (setA.has(w) && ++count >= 2) return true;
  }
  return false;
}

// Find an existing calendar event matching this show.
// Fetches ALL events in a ±1-day window (no text filter) so name mismatches are handled.
// Always prefers timed events (dateTime) over all-day events (date-only).
// Match priority per tier: 1. exact title, 2. case-insensitive contains, 3. ≥2 shared words on same date.
async function findExistingEvent(calendar, calendarId, date, title) {
  try {
    const base = new Date(date + 'T00:00:00+03:00');
    const timeMin = new Date(base); timeMin.setDate(timeMin.getDate() - 1);
    const timeMax = new Date(base); timeMax.setDate(timeMax.getDate() + 2);
    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      maxResults: 100,
    });
    const all = res.data.items || [];

    // Split: timed events always preferred over all-day events
    const timed  = all.filter((e) => !!e.start?.dateTime);
    const allDay = all.filter((e) => !e.start?.dateTime);

    const lower = title.toLowerCase();
    const dayMax = new Date(base); dayMax.setDate(dayMax.getDate() + 1);

    const findIn = (pool) => {
      // 1. Exact title match
      const exact = pool.find((e) => e.summary === title);
      if (exact) return exact;
      // 2. Case-insensitive contains
      const contains = pool.find((e) => {
        const s = (e.summary || '').toLowerCase();
        return s.includes(lower) || lower.includes(s);
      });
      if (contains) return contains;
      // 3. Same calendar date + at least 2 shared words
      const sameDay = pool.filter((e) => {
        const start = new Date(e.start?.dateTime || e.start?.date);
        return start >= base && start < dayMax;
      });
      return sameDay.find((e) => sharesTwoWords(title, e.summary || '')) || null;
    };

    // Try timed events first, fall back to all-day only if nothing found
    return findIn(timed) || findIn(allDay) || null;
  } catch {
    return null;
  }
}

// GET /api/calendar/config — returns current calendar ID + list of all accessible calendars
router.get('/config', async (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'Google Calendar not configured. Run gmail-auth.js first.' });
  const calendarId = getCalendarId();
  try {
    const auth     = getOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const listRes  = await calendar.calendarList.list({ maxResults: 50 });
    const calendars = (listRes.data.items || []).map((c) => ({
      id:      c.id,
      name:    c.summary,
      primary: !!c.primary,
    }));
    const current = calendars.find((c) => c.id === calendarId || (calendarId === 'primary' && c.primary));
    res.json({ calendarId, calendarName: current?.name || calendarId, calendars });
  } catch (err) {
    res.json({ calendarId, calendarName: calendarId, calendars: [] });
  }
});

// POST /api/calendar/config — save selected calendar ID
router.post('/config', (req, res) => {
  const { calendarId } = req.body;
  if (!calendarId) return res.status(400).json({ error: 'calendarId required' });
  fs.writeFileSync(CALENDAR_CFG_FILE, JSON.stringify({ calendarId }, null, 2));
  res.json({ ok: true, calendarId });
});

// POST /api/calendar/invite/:showId?test=1
// Finds an EXISTING calendar event matching the show name, then adds attendees to it.
// Does NOT create new events — if no matching event is found, returns 404.
// test=1 → only invite zlilmargalit0@gmail.com
router.post('/invite/:showId', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Google Calendar not configured. Run gmail-auth.js first.' });
  }

  const shows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const show  = shows.find((s) => s.id === req.params.showId);
  if (!show) return res.status(404).json({ error: 'Show not found' });

  const crew = fs.existsSync(CREW_FILE) ? JSON.parse(fs.readFileSync(CREW_FILE, 'utf8')) : [];
  const testMode = req.query.test === '1' || req.body.test === true;

  // Build attendees list
  let attendees;
  if (testMode) {
    attendees = [{ email: 'zlilmargalit0@gmail.com' }];
  } else {
    attendees = (show.crewIds || [])
      .map((id) => crew.find((m) => m.id === id))
      .filter((m) => m && m.email)
      .map((m) => ({ email: m.email, displayName: m.name }));
  }

  const calendarId = getCalendarId();

  try {
    const auth     = getOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    // Look for an existing event in the calendar with the same name (±2 days)
    const existing = await findExistingEvent(calendar, calendarId, show.date, show.name);

    if (!existing) {
      return res.status(404).json({
        error: `No event found in your calendar named "${show.name}" around ${show.date}. Make sure the event exists in Google Calendar with the same name.`,
      });
    }

    // Merge new attendees into the existing ones (don't remove existing attendees)
    const existingEmails = new Set((existing.attendees || []).map((a) => a.email));
    const mergedAttendees = [
      ...(existing.attendees || []),
      ...attendees.filter((a) => !existingEmails.has(a.email)),
    ];

    const result = await calendar.events.patch({
      calendarId,
      eventId:     existing.id,
      sendUpdates: 'all',
      requestBody: { attendees: mergedAttendees },
    });

    res.json({
      ok:        true,
      action:    'invited',
      eventId:   result.data.id,
      eventLink: result.data.htmlLink,
      eventName: existing.summary,
      attendees: attendees.map((a) => a.email),
    });
  } catch (err) {
    console.error('[calendar] Error:', err.message);
    if (err.message?.includes('insufficientPermissions') || err.message?.includes('forbidden')) {
      return res.status(403).json({
        error: 'Calendar access not authorised. Re-run: node server/scripts/gmail-auth.js',
      });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

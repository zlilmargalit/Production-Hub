const express = require('express');
const router  = express.Router();
const { google } = require('googleapis');
const fs   = require('fs');
const fsp  = require('fs').promises;
const path = require('path');
const { readJsonCached } = require('../cache');
const { DATA_DIR, dataPath, cacheKey } = require('../utils/userData');

const CREDENTIALS_PATH   = path.join(__dirname, '../data/gmail-credentials.json');
const TOKEN_PATH         = path.join(__dirname, '../data/gmail-token.json');
const CALENDAR_CFG_FILE  = path.join(DATA_DIR, 'calendar-config.json');

// Read calendar ID from config file; fall back to 'primary'.
// Kept sync because it's only called at the start of route handlers where
// the cost is negligible and we don't want to thread async through callers.
function getCalendarId() {
  try {
    return JSON.parse(fs.readFileSync(CALENDAR_CFG_FILE, 'utf8')).calendarId || 'primary';
  } catch {
    return 'primary';
  }
}

// Credentials come from either env vars (Railway / production) or local files
// (gitignored, for dev). Env vars take precedence so cloud deploys work
// without checking secrets into the repo.
function isConfigured() {
  if (process.env.GMAIL_CREDENTIALS && process.env.GMAIL_TOKEN) return true;
  return fs.existsSync(CREDENTIALS_PATH) && fs.existsSync(TOKEN_PATH);
}

function loadCreds() {
  const raw = process.env.GMAIL_CREDENTIALS
    ? process.env.GMAIL_CREDENTIALS
    : fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      'GMAIL_CREDENTIALS is not valid JSON. ' +
      'Set the Railway variable to the full contents of server/data/gmail-credentials.json (paste the raw JSON, not a shell command).'
    );
  }
}

function loadTokens() {
  const raw = process.env.GMAIL_TOKEN
    ? process.env.GMAIL_TOKEN
    : fs.readFileSync(TOKEN_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      'GMAIL_TOKEN is not valid JSON. ' +
      'Set the Railway variable to the full contents of server/data/gmail-token.json (paste the raw JSON, not a shell command).'
    );
  }
}

// OAuth client setup is bootstrap-time-equivalent; sync reads here are fine.
function getOAuthClient() {
  const creds  = loadCreds();
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const tokens = loadTokens();
  client.setCredentials(tokens);
  // Token refresh — only persist to disk if we're reading from disk (not env).
  // On Railway the filesystem is ephemeral; the env-var token will continue
  // working until it expires, at which point you re-issue it locally.
  client.on('tokens', async (newTokens) => {
    if (process.env.GMAIL_TOKEN) return;
    try {
      const current = JSON.parse(await fsp.readFile(TOKEN_PATH, 'utf8'));
      await fsp.writeFile(TOKEN_PATH, JSON.stringify({ ...current, ...newTokens }, null, 2));
    } catch (e) {
      console.error('[calendar] token refresh write failed:', e.message);
    }
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
// Throws on API errors — callers must handle.
async function findExistingEvent(calendar, calendarId, date, title) {
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
router.post('/config', async (req, res, next) => {
  try {
    const { calendarId } = req.body;
    if (!calendarId) return res.status(400).json({ error: 'calendarId required' });
    await fsp.writeFile(CALENDAR_CFG_FILE, JSON.stringify({ calendarId }, null, 2));
    res.json({ ok: true, calendarId });
  } catch (err) { next(err); }
});

// POST /api/calendar/invite/:showId?test=1
// Finds an EXISTING calendar event matching the show name, then adds attendees to it.
// Does NOT create new events — if no matching event is found, returns 404.
// test=1 → only invite zlilmargalit0@gmail.com
router.post('/invite/:showId', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Google Calendar not configured. Run gmail-auth.js first.' });
  }

  const userId = req.userId || 'admin';
  const shows = await readJsonCached(cacheKey(userId, 'shows'), dataPath(userId, 'shows.json'), []);
  const show  = shows.find((s) => s.id === req.params.showId);
  if (!show) return res.status(404).json({ error: 'Show not found' });

  const crew = await readJsonCached(cacheKey(userId, 'crew'), dataPath(userId, 'crew.json'), []);
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
    const msg = err?.message || String(err) || 'Google Calendar API error';
    console.error('[calendar/invite]', msg, err?.response?.data || '');
    if (msg.includes('GMAIL_TOKEN is not valid JSON') || msg.includes('GMAIL_CREDENTIALS is not valid JSON')) {
      return res.status(500).json({ error: msg });
    }
    if (msg.includes('insufficientPermissions') || msg.includes('forbidden')) {
      return res.status(403).json({ error: 'Calendar access not authorised. Re-run: node server/scripts/gmail-auth.js' });
    }
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired') || msg.includes('invalid_client')) {
      return res.status(401).json({ error: 'Google token expired — update GMAIL_TOKEN in Railway Variables with the current token from your local gmail-token.json' });
    }
    res.status(500).json({ error: msg });
  }
});

// POST /api/calendar/insert-show-event
// Creates (or updates) a Google Calendar event for a show, including the
// schedule into the description of the existing (or new) calendar event.
// Does NOT send invites, does NOT set location.
router.post('/insert-show-event', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Google Calendar not configured. Run gmail-auth.js first.' });
  }

  const { showId } = req.body || {};
  if (!showId) return res.status(400).json({ error: 'showId required' });

  const userId = req.userId || 'admin';
  const shows  = await readJsonCached(cacheKey(userId, 'shows'), dataPath(userId, 'shows.json'), []);
  const show   = shows.find((s) => s.id === showId);
  if (!show) return res.status(404).json({ error: 'Show not found' });
  if (!show.date) return res.status(400).json({ error: 'Show has no date set' });

  // Only the schedule goes into the event description — nothing else
  const description = show.schedule || '';

  // Patch body — only update description, nothing else
  const eventBody = { description };

  const dateBase   = show.date;
  const calendarId = getCalendarId();

  try {
    const auth     = getOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const existing = await findExistingEvent(calendar, calendarId, dateBase, show.name);
    let result, action;

    if (existing) {
      result = await calendar.events.patch({
        calendarId,
        eventId:     existing.id,
        sendUpdates: 'none',          // no invites
        requestBody: eventBody,
      });
      action = 'updated';
    } else {
      // No matching event found — create a minimal all-day event with the schedule
      result = await calendar.events.insert({
        calendarId,
        sendUpdates: 'none',          // no invites
        requestBody: {
          summary:     show.name,
          description,
          start: { date: dateBase },
          end:   { date: dateBase },
        },
      });
      action = 'created';
    }

    res.json({
      ok:        true,
      action,
      eventId:   result.data.id,
      eventLink: result.data.htmlLink,
    });
  } catch (err) {
    const msg = err?.message || String(err) || 'Google Calendar API error';
    console.error('[calendar/insert-show-event]', msg, err?.response?.data || '');
    if (msg.includes('GMAIL_TOKEN is not valid JSON') || msg.includes('GMAIL_CREDENTIALS is not valid JSON')) {
      return res.status(500).json({ error: msg });
    }
    if (msg.includes('insufficientPermissions') || msg.includes('forbidden')) {
      return res.status(403).json({ error: 'Calendar access not authorised. Re-run: node server/scripts/gmail-auth.js' });
    }
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired') || msg.includes('invalid_client')) {
      return res.status(401).json({ error: 'Google token expired — update GMAIL_TOKEN in Railway Variables with the current token from your local gmail-token.json' });
    }
    res.status(500).json({ error: msg });
  }
});

module.exports = router;

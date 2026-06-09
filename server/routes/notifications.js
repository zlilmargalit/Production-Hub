// Task Notifications — per-user settings, scheduling engine, channel dispatch.
// Implements the 5 rules from the Notification Settings handoff:
//   1. Auto reminder   — N hours before a timed task (per-task override wins)
//   2. Daily digest    — summary at a chosen time on chosen weekdays
//   3. Overdue nudge   — once/day per overdue open task
//   4. Assigned to me  — immediate on assignment (fired from tasks route)
//   5. Quiet hours     — suppress all EXCEPT the daily digest
//
// Channels: push (web-push) and/or email (Gmail). Both are validated by the
// POST /test endpoint so the user can confirm delivery end-to-end.

const express = require('express');
const fsp     = require('fs').promises;
const path    = require('path');

const { readJsonCached, writeJsonAndCache } = require('../cache');
const { DATA_DIR, dataPath, cacheKey, artistScopedId, parseUserId } = require('../utils/userData');
const { loadUsers } = require('../auth');
const { sendPushToUser, readPushList, initWebPush } = require('./automations');
const { sendEmail, emailConfigured } = require('../utils/email');

const router = express.Router();

// ── Default settings ─────────────────────────────────────────────────────────
function defaultSettings() {
  return {
    autoTimed: { on: true,  offset: 3 },
    digest:    { on: true,  time: '08:00', days: [0, 1, 2, 3, 4] },
    overdue:   { on: true,  time: '09:00' },
    assigned:  { on: true },
    quiet:     { on: false, from: '22:00', to: '07:00' },
    channels:  { push: true, email: false },
    email:     { address: '' },
  };
}

// Deep-ish merge so a partial PUT keeps untouched sub-keys.
function mergeSettings(base, patch) {
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...(base[k] || {}), ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

const settingsCK = (uid) => cacheKey(uid, 'notif-settings');
const settingsFile = (uid) => dataPath(uid, 'notification-settings.json');
const logCK = (uid) => cacheKey(uid, 'notif-log');
const logFile = (uid) => dataPath(uid, 'notification-log.json');

async function readSettings(userId) {
  const stored = await readJsonCached(settingsCK(userId), settingsFile(userId), null);
  return stored ? mergeSettings(defaultSettings(), stored) : defaultSettings();
}
async function writeSettings(userId, data) {
  await fsp.mkdir(path.dirname(settingsFile(userId)), { recursive: true });
  return writeJsonAndCache(settingsCK(userId), settingsFile(userId), data);
}
async function readLog(userId) {
  return readJsonCached(logCK(userId), logFile(userId), {});
}
async function writeLog(userId, data) {
  await fsp.mkdir(path.dirname(logFile(userId)), { recursive: true });
  return writeJsonAndCache(logCK(userId), logFile(userId), data);
}

// ── Asia/Jerusalem time parts ────────────────────────────────────────────────
function jerusalemNow() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0; // some ICU builds emit 24 at midnight
  const minute = parseInt(p.minute, 10);
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    day: wd,
    minutesOfDay: hour * 60 + minute,
  };
}

const hhmmToMin = (s) => {
  const [h, m] = String(s || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const SLOT = 15; // cron tick width in minutes

// Fire when `now` is within the current SLOT window starting at fireMin.
function inSlot(nowMin, fireMin) {
  if (fireMin == null) return false;
  return nowMin >= fireMin && nowMin < fireMin + SLOT;
}

function inQuiet(settings, nowMin) {
  if (!settings.quiet?.on) return false;
  const from = hhmmToMin(settings.quiet.from);
  const to = hhmmToMin(settings.quiet.to);
  if (from == null || to == null || from === to) return false;
  return from < to ? (nowMin >= from && nowMin < to) : (nowMin >= from || nowMin < to);
}

// ── Channel dispatch ─────────────────────────────────────────────────────────
async function deliver(userId, settings, title, body) {
  const ch = settings.channels || {};
  const result = { push: 'skip', email: 'skip' };
  if (ch.push) {
    try {
      const subs = await readPushList(userId);
      if (!subs.length) {
        result.push = 'no-subscription';
      } else {
        await sendPushToUser(userId, title, body);
        result.push = 'sent';
      }
    } catch (e) { result.push = 'error: ' + e.message; }
  }
  if (ch.email && settings.email?.address) {
    try { await sendEmail(settings.email.address, title, body); result.email = 'sent'; }
    catch (e) { result.email = 'error: ' + e.message; }
  }
  return result;
}

// ── Task collection (own + artist-scoped) for one real user ──────────────────
async function collectSources(userId) {
  const sources = [];
  const add = async (scopedId) => {
    let tasks;
    try { tasks = JSON.parse(await fsp.readFile(dataPath(scopedId, 'tasks.json'), 'utf8')); }
    catch { return; }
    let shows = [];
    try { shows = JSON.parse(await fsp.readFile(dataPath(scopedId, 'shows.json'), 'utf8')); } catch { /* ok */ }
    const showMap = {};
    shows.forEach((s) => { showMap[s.id] = s.name; });
    sources.push({ scopedId, tasks, showMap });
  };

  await add(userId);

  const artistsBase = userId === 'admin'
    ? path.join(DATA_DIR, 'artists')
    : path.join(DATA_DIR, 'users', userId, 'artists');
  try {
    const entries = await fsp.readdir(artistsBase, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) await add(artistScopedId(userId, e.name));
    }
  } catch { /* no artists dir */ }

  return sources;
}

// Compute the reminder fire-minute for a timed task, honoring a manual override.
function reminderFireMin(task, settings) {
  const r = task.reminder;
  if (r && r.type === 'abs' && r.at) return hhmmToMin(r.at);
  const taskMin = hhmmToMin(task.dueTime);
  if (taskMin == null) return null; // not a timed task
  let offsetH;
  if (r && r.type === 'rel' && typeof r.offset === 'number') offsetH = r.offset;
  else if (settings.autoTimed?.on) offsetH = settings.autoTimed.offset;
  else return null; // no manual reminder and auto reminders are off
  return taskMin - offsetH * 60;
}

function taskLabel(task, showMap) {
  const show = task.showId && showMap[task.showId];
  return show ? `${task.text} — ${show}` : task.text;
}

// Prune log keys whose trailing :YYYY-MM-DD is older than `keepFrom`.
function pruneLog(log, keepFromDate) {
  const out = {};
  for (const k of Object.keys(log)) {
    const m = k.match(/(\d{4}-\d{2}-\d{2})$/);
    if (!m || m[1] >= keepFromDate) out[k] = log[k];
  }
  return out;
}

// ── The engine: one tick covers reminders, digest, overdue for all users ─────
async function runTick() {
  const now = jerusalemNow();
  const userIds = ['admin'];
  try { loadUsers().forEach((u) => userIds.push(u.id)); } catch { /* admin-only */ }

  for (const userId of userIds) {
    try {
      const settings = await readSettings(userId);
      // Nothing to deliver if no channel is on.
      if (!settings.channels?.push && !settings.channels?.email) continue;

      const sources = await collectSources(userId);
      let log = await readLog(userId);
      let changed = false;

      // ── Daily digest (fires even during quiet hours) ──────────────────────
      if (settings.digest?.on && (settings.digest.days || []).includes(now.day)
          && inSlot(now.minutesOfDay, hhmmToMin(settings.digest.time))) {
        const key = `digest:${now.date}`;
        if (!log[key]) {
          const lines = [];
          for (const src of sources) {
            for (const t of src.tasks) {
              if (t.completed) continue;
              if (t.dueDate && t.dueDate <= now.date) {
                lines.push(`• ${taskLabel(t, src.showMap)}${t.dueTime ? ' · ' + t.dueTime.slice(0, 5) : ''}`);
              }
            }
          }
          if (lines.length) {
            await deliver(userId, settings, `Daily digest — ${lines.length} task(s)`, lines.join('\n'));
          }
          log[key] = true; changed = true;
        }
      }

      const quiet = inQuiet(settings, now.minutesOfDay);

      // ── Reminders + overdue (suppressed during quiet hours) ───────────────
      if (!quiet) {
        for (const src of sources) {
          for (const t of src.tasks) {
            if (t.completed) continue;

            // Reminder for timed tasks due today
            if (t.dueDate === now.date) {
              const fireMin = reminderFireMin(t, settings);
              if (inSlot(now.minutesOfDay, fireMin)) {
                const key = `rem:${t.id}:${now.date}`;
                if (!log[key]) {
                  const when = t.dueTime ? t.dueTime.slice(0, 5) : '';
                  await deliver(userId, settings, taskLabel(t, src.showMap),
                    when ? `Due at ${when}` : 'Reminder');
                  log[key] = true; changed = true;
                }
              }
            }

            // Overdue nudge once/day at configured time
            if (settings.overdue?.on && t.dueDate && t.dueDate < now.date
                && inSlot(now.minutesOfDay, hhmmToMin(settings.overdue.time))) {
              const key = `overdue:${t.id}:${now.date}`;
              if (!log[key]) {
                await deliver(userId, settings, `Overdue: ${taskLabel(t, src.showMap)}`,
                  `Was due ${t.dueDate}`);
                log[key] = true; changed = true;
              }
            }
          }
        }
      }

      if (changed) {
        // keep ~4 days of history
        const keepFrom = new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10);
        log = pruneLog(log, keepFrom);
        await writeLog(userId, log);
      }
    } catch (err) {
      console.error(`[notifications] tick error for user ${userId}:`, err.message);
    }
  }
}

// Immediate "assigned to me" notification — called from the tasks route.
// `actorUserId` is the (possibly artist-scoped) id whose workspace owns the task.
async function notifyAssigned(actorUserId, task) {
  try {
    const { realUserId } = parseUserId(actorUserId);
    const settings = await readSettings(realUserId);
    if (!settings.assigned?.on) return;
    if (inQuiet(settings, jerusalemNow().minutesOfDay)) return;
    const who = task.assigneeName ? ` (${task.assigneeName})` : '';
    await deliver(realUserId, settings, 'New task assigned',
      `${task.text}${who}`);
  } catch (err) {
    console.error('[notifications] notifyAssigned error:', err.message);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Notifications are a per-account concern, not per-artist — always resolve the
// real user id so settings/push line up with what the engine reads.
const realUid = (req) => parseUserId(req.userId).realUserId;

// GET /api/notification-settings
router.get('/notification-settings', async (req, res, next) => {
  try {
    res.json(await readSettings(realUid(req)));
  } catch (err) { next(err); }
});

// PUT /api/notification-settings  (partial merge)
router.put('/notification-settings', async (req, res, next) => {
  try {
    const uid = realUid(req);
    const current = await readSettings(uid);
    const merged = mergeSettings(current, req.body || {});
    await writeSettings(uid, merged);
    res.json(merged);
  } catch (err) { next(err); }
});

// POST /api/notifications/test — fire a sample alert through configured channels.
router.post('/notifications/test', async (req, res, next) => {
  try {
    initWebPush();
    const uid = realUid(req);
    const settings = await readSettings(uid);
    const pushOn = !!settings.channels?.push;
    const emailOn = !!settings.channels?.email;

    if (!pushOn && !emailOn) {
      return res.status(400).json({ error: 'No channel enabled. Turn on Push or Email first.' });
    }

    const warnings = [];
    if (pushOn) {
      const subs = await readPushList(uid);
      if (!subs.length) warnings.push('No push subscription — enable notifications on this device first.');
    }
    if (emailOn) {
      if (!settings.email?.address) warnings.push('Email channel is on but no email address is set.');
      else if (!emailConfigured()) warnings.push('Email is not configured on the server.');
    }

    const result = await deliver(uid, settings,
      'Production Hub', 'Test notification — your alerts are working.');

    res.json({ result, warnings });
  } catch (err) { next(err); }
});

// POST /api/notifications/run — manual engine trigger (admin only) for testing.
router.post('/notifications/run', async (req, res, next) => {
  try {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    await runTick();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Cron registration ────────────────────────────────────────────────────────
function startNotificationCron() {
  let cron;
  try { cron = require('node-cron'); } catch { return; }
  initWebPush();
  cron.schedule('*/15 * * * *', runTick, { timezone: 'Asia/Jerusalem' });
  console.log('[notifications] Engine registered (every 15 min, Asia/Jerusalem)');
}

module.exports = { router, startNotificationCron, notifyAssigned, runTick };

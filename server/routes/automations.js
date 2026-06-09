// Automations & Integrations route
// All endpoints require auth (set by the auth gate in index.js via req.userId).
// "workspaceId" in the spec maps to req.userId in this codebase.
// Data is stored in per-user JSON files, following the same pattern as shows/crew.

const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const fsp     = require('fs').promises;
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');

const { readJsonCached, writeJsonAndCache } = require('../cache');
const { DATA_DIR, dataPath, cacheKey, artistScopedId } = require('../utils/userData');
const { loadUsers } = require('../auth');

const router       = express.Router();   // authenticated (mounted after auth gate)
const publicRouter = express.Router();   // OAuth callback only (mounted before auth gate)

// ── Encryption helpers (AES-256-GCM, key derived from AUTH_PASSWORD) ─────────
function getEncKey() {
  return crypto
    .createHash('sha256')
    .update('ph-integrations|' + (process.env.AUTH_PASSWORD || ''))
    .digest();
}

function encrypt(text) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncKey(), iv);
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(encoded) {
  try {
    const [ivH, tagH, encH] = encoded.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncKey(), Buffer.from(ivH, 'hex'));
    decipher.setAuthTag(Buffer.from(tagH, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encH, 'hex')), decipher.final()]).toString('utf8');
  } catch { return null; }
}

// ── OAuth state helpers (HMAC-signed, 10-min TTL) ─────────────────────────────
function signOAuthState(userId, provider) {
  const payload = Buffer.from(JSON.stringify({ userId, provider, t: Date.now() })).toString('base64url');
  const sig     = crypto.createHmac('sha256', getEncKey()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyOAuthState(state) {
  if (!state) return null;
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', getEncKey()).update(payload).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() - data.t > 10 * 60 * 1000) return null; // 10-min window
    return data;
  } catch { return null; }
}

// ── Railway persistence: seed integrations.json from env var on cold start ───
// Railway's filesystem is ephemeral — every deploy wipes it.
// INTEGRATIONS_DATA env var acts as a persistent backup for admin's tokens.
// Workflow:
//   1. Connect integrations via Settings → tokens written to integrations.json.
//   2. Visit Settings → "Backup connections" → copy JSON → paste into
//      INTEGRATIONS_DATA Railway env var.
//   3. Next deploy: this block seeds the file automatically → stays connected.
(function seedIntegrationsFromEnv() {
  if (!process.env.INTEGRATIONS_DATA) return;
  const adminFile = path.join(DATA_DIR, 'integrations.json');
  if (fs.existsSync(adminFile)) return; // already seeded this session or running locally
  try {
    JSON.parse(process.env.INTEGRATIONS_DATA); // validate before writing
    fs.mkdirSync(path.dirname(adminFile), { recursive: true });
    fs.writeFileSync(adminFile, process.env.INTEGRATIONS_DATA, 'utf8');
    console.log('[automations] Restored integrations.json from INTEGRATIONS_DATA env var');
  } catch (e) {
    console.error('[automations] INTEGRATIONS_DATA is not valid JSON — integrations not restored:', e.message);
  }
})();

// ── Per-user file helpers ─────────────────────────────────────────────────────
function userDir(userId) {
  if (!userId || userId === 'admin') return DATA_DIR;
  return path.join(DATA_DIR, 'users', userId);
}

const autoFile = (uid) => path.join(userDir(uid), 'automations.json');
const intgFile = (uid) => path.join(userDir(uid), 'integrations.json');
const pushFile = (uid) => path.join(userDir(uid), 'push-subscriptions.json');

const autoCK = (uid) => `automations:${uid}`;
const intgCK = (uid) => `integrations:${uid}`;
const pushCK = (uid) => `push-subs:${uid}`;

async function ensureDir(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

async function readAutoList(uid)       { return readJsonCached(autoCK(uid), autoFile(uid), []); }
async function writeAutoList(uid, d)   { await ensureDir(autoFile(uid)); return writeJsonAndCache(autoCK(uid), autoFile(uid), d); }
async function readIntgMap(uid)        { return readJsonCached(intgCK(uid), intgFile(uid), {}); }
async function writeIntgMap(uid, d)    { await ensureDir(intgFile(uid)); return writeJsonAndCache(intgCK(uid), intgFile(uid), d); }
async function readPushList(uid)       { return readJsonCached(pushCK(uid), pushFile(uid), []); }
async function writePushList(uid, d)   { await ensureDir(pushFile(uid)); return writeJsonAndCache(pushCK(uid), pushFile(uid), d); }

// ── Google OAuth client factory ───────────────────────────────────────────────
const CREDENTIALS_PATH = path.join(__dirname, '../data/gmail-credentials.json');

function buildCallbackUrl(req, provider) {
  // Use configured BASE_URL env var if set (needed in Railway where req.host
  // may differ from the public domain), otherwise construct from request.
  const base = process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/$/, '')
    : `${req.protocol}://${req.get('host')}`;
  return `${base}/api/automations/integrations/${provider}/callback`;
}

function getOAuthClient(callbackUrl) {
  // Automations needs a Web-application type OAuth client (not Desktop/installed)
  // because it uses server-side redirect URIs. Use AUTOMATIONS_CREDENTIALS if set;
  // fall back to GMAIL_CREDENTIALS / local file (Desktop type — only works for localhost).
  const raw = process.env.AUTOMATIONS_CREDENTIALS
    || process.env.GMAIL_CREDENTIALS
    || fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const creds = JSON.parse(raw);
  const { client_id, client_secret } = creds.web || creds.installed;
  return new google.auth.OAuth2(client_id, client_secret, callbackUrl);
}

const PROVIDER_SCOPES = {
  gmail:  ['https://www.googleapis.com/auth/gmail.readonly'],
  gcal:   ['https://www.googleapis.com/auth/calendar.events'],
  gdrive: ['https://www.googleapis.com/auth/drive.file'],
};

// ── Condition validation whitelist ────────────────────────────────────────────
const ALLOWED_FIELDS = ['subject', 'from', 'body', 'daysBeforeShow', 'eventType', 'venue', 'status'];
const ALLOWED_OPS    = ['contains', 'not-contains', 'equals', 'not-equals', 'gt', 'lt'];

function validateConditions(conditions) {
  if (!Array.isArray(conditions)) return false;
  return conditions.every(
    (c) =>
      ALLOWED_FIELDS.includes(c.field) &&
      ALLOWED_OPS.includes(c.op) &&
      typeof c.value === 'string' &&
      c.value.length < 500 &&
      ['AND', 'OR', null, undefined].includes(c.logic)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC router — OAuth callbacks only (no auth required; userId comes from state)
// ─────────────────────────────────────────────────────────────────────────────
publicRouter.get('/integrations/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const { code, state } = req.query;

  if (!PROVIDER_SCOPES[provider]) return res.redirect('/automations?intg=error');
  if (!code) return res.redirect('/automations?intg=cancelled');

  const stateData = verifyOAuthState(state);
  if (!stateData || stateData.provider !== provider) {
    return res.redirect('/automations?intg=error');
  }

  try {
    const callbackUrl   = buildCallbackUrl(req, provider);
    const oauth2Client  = getOAuthClient(callbackUrl);
    const { tokens }    = await oauth2Client.getToken(code);

    const intgMap = await readIntgMap(stateData.userId);
    intgMap[provider] = {
      connected:    true,
      accessToken:  encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : (intgMap[provider]?.refreshToken || null),
      tokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      scopes:    PROVIDER_SCOPES[provider],
      updatedAt: new Date().toISOString(),
    };
    await writeIntgMap(stateData.userId, intgMap);
    res.redirect('/automations?intg=ok');
  } catch (err) {
    console.error('[automations/callback]', provider, err.message);
    res.redirect('/automations?intg=error');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED router
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/automations/integrations  → { gmail: bool, gcal: bool, gdrive: bool }
router.get('/integrations', async (req, res) => {
  try {
    const map = await readIntgMap(req.userId);
    res.json({
      gmail:  !!map.gmail?.connected,
      gcal:   !!map.gcal?.connected,
      gdrive: !!map.gdrive?.connected,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/automations/integrations/:provider/connect  → redirect to OAuth consent
router.get('/integrations/:provider/connect', (req, res) => {
  const { provider } = req.params;
  if (!PROVIDER_SCOPES[provider]) return res.status(400).json({ error: 'Unknown provider' });

  const callbackUrl  = buildCallbackUrl(req, provider);
  // Log so we can verify what Google is seeing during OAuth
  console.log('[automations/connect] redirect_uri =', callbackUrl);
  const oauth2Client = getOAuthClient(callbackUrl);
  const state        = signOAuthState(req.userId, provider);
  const url          = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       PROVIDER_SCOPES[provider],
    state,
    prompt:      'consent',
  });
  res.redirect(url);
});

// DELETE /api/automations/integrations/:provider  → disconnect
router.delete('/integrations/:provider', async (req, res) => {
  const { provider } = req.params;
  if (!PROVIDER_SCOPES[provider]) return res.status(400).json({ error: 'Unknown provider' });

  try {
    const map = await readIntgMap(req.userId);
    if (map[provider]?.accessToken) {
      try {
        const token       = decrypt(map[provider].accessToken);
        const callbackUrl = buildCallbackUrl(req, provider);
        await getOAuthClient(callbackUrl).revokeToken(token);
      } catch { /* non-fatal */ }
    }
    delete map[provider];
    await writeIntgMap(req.userId, map);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/automations/integrations/export
// Admin-only: returns current integrations.json content (encrypted tokens) for
// copying into the INTEGRATIONS_DATA Railway env var to survive future deploys.
router.get('/integrations/export', async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const data = await readIntgMap('admin');
    res.json({ data: JSON.stringify(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/automations  → list all automations for this workspace
router.get('/', async (req, res) => {
  try {
    const list = await readAutoList(req.userId);
    res.json([...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automations  → create
router.post('/', async (req, res) => {
  const { label, triggerType, conditions, actionType, actionParams, isRecipe, recipeId } = req.body || {};

  if (!label || !triggerType || !actionType) {
    return res.status(400).json({ error: 'label, triggerType, and actionType are required' });
  }
  if (!validateConditions(conditions || [])) {
    return res.status(400).json({ error: 'Invalid condition fields or operators' });
  }

  try {
    const list   = await readAutoList(req.userId);
    const record = {
      id:              uuidv4(),
      workspaceId:     req.userId,
      createdByUserId: req.userId,
      label:           label.trim().slice(0, 300),
      triggerType,
      conditions:      conditions || [],
      actionType,
      actionParams:    actionParams || {},
      active:          true,
      isRecipe:        !!isRecipe,
      recipeId:        recipeId || null,
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };
    list.push(record);
    await writeAutoList(req.userId, list);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/automations/:id  → toggle active and/or update actionParams
router.patch('/:id', async (req, res) => {
  const { active, actionParams } = req.body || {};
  try {
    const list = await readAutoList(req.userId);
    const idx  = list.findIndex((a) => a.id === req.params.id && a.workspaceId === req.userId);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const patch = { updatedAt: new Date().toISOString() };
    if (typeof active === 'boolean') patch.active = active;
    if (actionParams && typeof actionParams === 'object' && !Array.isArray(actionParams)) {
      // Merge — don't allow replacing with arbitrary keys, only accepted ones
      const allowedKeys = [
        // email-to-shows
        'senderEmail', 'subjectKeywords', 'nameField', 'namePattern',
        'artistPattern', 'venuePattern', 'datePattern',
        // auto-folders
        'folderTemplate', 'useDrive', 'driveFolderId', 'useLocal', 'localPath',
        // early-coord
        'message', 'daysBeforeShow',
        // generic
        'nameTemplate',
      ];
      const safe = {};
      allowedKeys.forEach((k) => { if (k in actionParams) safe[k] = actionParams[k]; });
      patch.actionParams = { ...(list[idx].actionParams || {}), ...safe };
    }

    list[idx] = { ...list[idx], ...patch };
    await writeAutoList(req.userId, list);
    res.json(list[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/automations/:id
router.delete('/:id', async (req, res) => {
  try {
    const list     = await readAutoList(req.userId);
    const filtered = list.filter((a) => !(a.id === req.params.id && a.workspaceId === req.userId));
    if (filtered.length === list.length) return res.status(404).json({ error: 'Not found' });
    await writeAutoList(req.userId, filtered);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/automations/push/vapid-public-key
router.get('/push/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications not configured on this server' });
  res.json({ key });
});

// POST /api/automations/push/subscribe
router.post('/push/subscribe', async (req, res) => {
  const { endpoint, p256dh, auth } = req.body || {};
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'endpoint, p256dh, and auth are required' });
  }
  if (!endpoint.startsWith('https://')) {
    return res.status(400).json({ error: 'endpoint must be an https:// URL' });
  }

  try {
    const list = await readPushList(req.userId);
    const idx  = list.findIndex((s) => s.userId === req.userId && s.endpoint === endpoint);
    const record = {
      id:          idx >= 0 ? list[idx].id : uuidv4(),
      userId:      req.userId,
      workspaceId: req.userId,
      endpoint,
      p256dh,
      auth,
      createdAt:   idx >= 0 ? list[idx].createdAt : new Date().toISOString(),
    };
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    await writePushList(req.userId, list);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/automations/push/unsubscribe
// Body: { endpoint: string } — remove only the specific device subscription.
router.delete('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    const list     = await readPushList(req.userId);
    const filtered = list.filter((s) => s.endpoint !== endpoint);
    await writePushList(req.userId, filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CRON JOB — Early Coordination Alert (runs daily at 09:00)
// ─────────────────────────────────────────────────────────────────────────────
let webpush;
try { webpush = require('web-push'); } catch { /* web-push not installed */ }

function initWebPush() {
  if (!webpush) return;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:admin@production-hub.app';
  if (pub && priv) {
    webpush.setVapidDetails(subj, pub, priv);
    console.log('[push] VAPID configured, pubkey prefix:', pub.slice(0, 12));
  } else {
    console.warn('[push] VAPID keys missing — VAPID_PUBLIC_KEY:', !!pub, 'VAPID_PRIVATE_KEY:', !!priv);
  }
}

/**
 * Interpolate show fields into a message template.
 * Supports: [Show Name], [Show Date], [Venue]
 */
function interpolate(template, show) {
  return (template || '')
    .replace(/\[Show Name\]/gi,  show.name  || '')
    .replace(/\[Show Date\]/gi,  show.date  || '')
    .replace(/\[Venue\]/gi,      show.venue || '');
}

/**
 * Send push to all subscriptions for a user. Cleans up 410 Gone subs.
 */
async function sendPushToUser(userId, title, body) {
  if (!webpush) return;
  const list = await readPushList(userId);
  if (!list.length) return;

  const payload = JSON.stringify({ title, body, icon: '/icon-192.png' });
  const toRemove = [];

  await Promise.all(
    list.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        if (err.statusCode === 410) toRemove.push(sub.endpoint);
        else console.error('[push] failed for', sub.endpoint, err.message);
      }
    })
  );

  if (toRemove.length) {
    const cleaned = list.filter((s) => !toRemove.includes(s.endpoint));
    await writePushList(userId, cleaned);
    console.log(`[automations/cron] Removed ${toRemove.length} stale push subscription(s) for user ${userId}`);
  }
}

/**
 * Check one user's automations for schedule-based early-coord alerts.
 * @param {string} userId
 * @param {{ id: string, name: string, date?: string, venue?: string }[]} shows
 */
async function checkUserScheduleAutomations(userId, shows) {
  const automations = await readAutoList(userId);
  const scheduleAutos = automations.filter(
    (a) => a.active && a.triggerType === 'schedule',
  );
  if (!scheduleAutos.length) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const automation of scheduleAutos) {
    // Determine the "days before" threshold from conditions or actionParams
    let daysAhead = 14; // default
    const daysCond = (automation.conditions || []).find((c) => c.field === 'daysBeforeShow');
    if (daysCond && !isNaN(Number(daysCond.value))) daysAhead = Number(daysCond.value);
    if (automation.actionParams?.daysBeforeShow) daysAhead = Number(automation.actionParams.daysBeforeShow);

    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysAhead);

    const matchingShows = shows.filter((s) => {
      if (!s.date) return false;
      const showDate = new Date(s.date);
      showDate.setHours(0, 0, 0, 0);
      return showDate.getTime() === targetDate.getTime();
    });

    for (const show of matchingShows) {
      const title   = 'Production Hub';
      const message = interpolate(
        automation.actionParams?.message ||
          `Heads up — [Show Name] is in ${daysAhead} days! ([Show Date], [Venue])`,
        show,
      );
      console.log(`[automations/cron] Sending push for show "${show.name}" → user ${userId}`);
      await sendPushToUser(userId, title, message);
    }
  }
}

/**
 * Main cron callback — iterates over every user (admin + registered) and
 * evaluates schedule-based automations against their shows.
 */
/**
 * Send push notifications for tasks due today (not yet notified, not completed).
 * Marks each fired task with pushNotifiedAt so it never fires twice.
 *
 * @param {string} userId     - Data-path userId (may be artist-scoped: "admin__art__xyz")
 * @param {Array}  shows      - Shows array for the same scope (for show-name lookup)
 * @param {string} [pushUserId] - Real user to send push to (defaults to userId).
 *                               Must be provided when userId is artist-scoped.
 */
async function checkUserTasksDue(userId, shows, pushUserId) {
  const tasksFile = dataPath(userId, 'tasks.json');
  let tasks = [];
  try {
    tasks = JSON.parse(await fsp.readFile(tasksFile, 'utf8'));
  } catch { return; } // no tasks file → skip

  const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  const due = tasks.filter(
    (t) => t.dueDate === todayStr && !t.completed && !t.pushNotifiedAt,
  );
  if (!due.length) return;

  // Build a quick showId → name map
  const showMap = {};
  (shows || []).forEach((s) => { showMap[s.id] = s.name; });

  const targetUserId = pushUserId || userId;

  for (const task of due) {
    const body = task.showId && showMap[task.showId]
      ? `Show: ${showMap[task.showId]}`
      : 'Task due today';
    console.log(`[tasks/cron] Sending push for task "${task.text}" → user ${targetUserId}`);
    await sendPushToUser(targetUserId, task.text, body);
  }

  // Mark all fired tasks in one write (also updates cache so next GET is fresh)
  const now = new Date().toISOString();
  const updatedTasks = tasks.map((t) =>
    (t.dueDate === todayStr && !t.completed && !t.pushNotifiedAt)
      ? { ...t, pushNotifiedAt: now }
      : t,
  );
  await writeJsonAndCache(cacheKey(userId, 'tasks'), dataPath(userId, 'tasks.json'), updatedTasks);
}

async function runDailyCheck() {
  console.log('[automations/cron] Running daily schedule check…');
  initWebPush();

  // Collect all user IDs to check
  const allUserIds = ['admin'];
  try {
    const users = loadUsers();
    users.forEach((u) => allUserIds.push(u.id));
  } catch { /* users file missing — admin-only mode */ }

  for (const userId of allUserIds) {
    try {
      // ── 1. Non-artist-scoped shows + tasks ────────────────────────────────
      const showsFile = path.join(userDir(userId), 'shows.json');
      let ownShows = [];
      try {
        ownShows = JSON.parse(await fsp.readFile(showsFile, 'utf8'));
      } catch { /* no shows — tasks can still fire without show names */ }

      await checkUserScheduleAutomations(userId, ownShows);
      await checkUserTasksDue(userId, ownShows);

      // ── 2. Artist-scoped shows + tasks ────────────────────────────────────
      // For admin:  DATA_DIR/artists/{artistId}/
      // For users:  DATA_DIR/users/{userId}/artists/{artistId}/
      const artistsBaseDir = userId === 'admin'
        ? path.join(DATA_DIR, 'artists')
        : path.join(DATA_DIR, 'users', userId, 'artists');

      let artistDirs = [];
      try {
        const entries = await fsp.readdir(artistsBaseDir, { withFileTypes: true });
        artistDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch { /* no artists directory — skip */ }

      for (const artistId of artistDirs) {
        try {
          const scopedId = artistScopedId(userId, artistId);

          const artistShowsFile = dataPath(scopedId, 'shows.json');
          let artistShows = [];
          try {
            artistShows = JSON.parse(await fsp.readFile(artistShowsFile, 'utf8'));
          } catch { /* no shows */ }

          // Tasks live at the artist-scoped path; push goes to the real user.
          await checkUserTasksDue(scopedId, artistShows, userId);
        } catch (err) {
          console.error(
            `[automations/cron] Error processing artist ${artistId} for user ${userId}:`,
            err.message,
          );
        }
      }
    } catch (err) {
      console.error(`[automations/cron] Error processing user ${userId}:`, err.message);
    }
  }
  console.log('[automations/cron] Daily schedule check complete.');
}

/**
 * Start the node-cron daily scheduler.  Called from server/index.js at startup.
 */
function startCron() {
  let cron;
  try { cron = require('node-cron'); } catch { return; }
  initWebPush();
  // Run at 09:00 every day
  cron.schedule('0 9 * * *', runDailyCheck, { timezone: 'Asia/Jerusalem' });
  console.log('[automations/cron] Daily scheduler registered (09:00 Asia/Jerusalem)');
}

// ── POST /api/automations/cron/trigger (admin only) ──────────────────────────
// Immediately runs the daily task+schedule check without waiting for 09:00.
// Useful to fire missed notifications or to verify the cron logic after a fix.
router.post('/cron/trigger', async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  try {
    await runDailyCheck();
    res.json({ ok: true, message: 'Daily check completed' });
  } catch (err) {
    console.error('[automations/cron/trigger]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/automations/push/test ─────────────────────────────────────────
// Immediately fires a dummy push to the current user's subscriptions.
// Useful for verifying VAPID setup and OS notification appearance.
router.post('/push/test', async (req, res) => {
  initWebPush();
  if (!webpush) return res.status(503).json({ error: 'web-push not available on this server' });

  const list = await readPushList(req.userId);
  if (!list.length) {
    return res.status(404).json({ error: 'No active push subscription found. Enable notifications in the Automations tab first.' });
  }

  const payload = JSON.stringify({
    title: 'Production Hub',
    body:  'Push notifications are working',
    icon:  '/icon-192.png',
  });

  let sent = 0;
  const toRemove = [];
  const errors = [];
  await Promise.all(
    list.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 410) {
          toRemove.push(sub.endpoint);
        } else {
          const detail = `${err.statusCode || ''} ${err.message}`.trim();
          console.error('[push/test] failed:', detail, err.body || '');
          errors.push(detail);
        }
      }
    }),
  );

  if (toRemove.length) {
    const cleaned = list.filter((s) => !toRemove.includes(s.endpoint));
    await writePushList(req.userId, cleaned);
  }

  if (sent === 0) {
    const detail = errors[0] || 'unknown error';
    return res.status(500).json({ error: `Push delivery failed: ${detail}` });
  }
  res.json({ sent });
});

module.exports = { router, publicRouter, startCron, sendPushToUser, readPushList, initWebPush };

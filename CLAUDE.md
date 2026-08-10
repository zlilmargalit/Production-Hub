# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Rule
Reply to the user in Hebrew.

Separate from how you reply: the **product's UI chrome is English** — labels,
buttons, headings, tabs, statuses, empty states. Only content the user types
(project, client, shop and people names, notes) is Hebrew, and that renders RTL.
Do not translate UI strings to Hebrew and do not add an i18n layer.

## Found issues log

While working, append anything noticed in passing to `docs/found-issues.md` —
what it is, how it was confirmed, what it costs to leave. **Log it, do not fix
it**, unless it is critical (data loss, a security hole, or something actively
broken for users), in which case fix it and say so.

The point is that noticing something is not a reason to widen the current task.

## Common commands

Three separate `package.json` files (root / `server/` / `client/`). Root scripts
fan out to the two child projects — always install through the root or through
the child directory that owns the dependency, never mix.

- `npm run install:all` — install root, server, and client deps.
- `npm run dev` — start both server (`node --watch server/index.js`) and Vite
  dev server via `concurrently`. Vite serves the client on `:3000` and proxies
  `/api/*` → `http://localhost:3001` (see `client/vite.config.js`), so open
  the app at `http://localhost:3000`.
- `npm run build` — installs both workspaces and runs `vite build` (client
  output goes to `client/dist/`, which the Express server serves in
  production).
- `npm start` — production start (`node server/index.js`). Serves the built
  client from `client/dist/` and all `/api/*` routes from the same port
  (`PORT`, default `3001`).
- No test runner is configured (there is no `test` script in any package.json).

Environment (see `.env.example`, `server/.env.example`):
- Local Mac dev leaves `PDF_DIR` / `CHROME_PATH` / `DATA_DIR` unset — the
  server picks Mac-appropriate defaults (e.g. `PDF_DIR` = `~/Desktop/Production/דפי תיאום`,
  Chrome from `/Applications/Google Chrome.app/...`, `DATA_DIR` = `server/data/`).
- Railway/Linux requires `DATA_DIR=/data` (the mounted persistent volume),
  `CHROME_PATH=/usr/bin/chromium`, and no `PDF_DIR` (so PDFs stream back as
  downloads instead of writing to a Mac path).

Deploy: Railway using `nixpacks.toml` (Node 20 + chromium + poppler_utils).
`ecosystem.config.cjs` is a PM2 config for running the server locally as a
long-lived process.

## High-level architecture

Small monorepo: a single Express server (`server/`) that hosts a React+Vite
SPA (`client/`) and stores everything as JSON files on a persistent volume.
There is no database.

### Server (`server/`)

- `server/index.js` (~1800 lines) is the app bootstrap: mounts all routers,
  handles cookie-session auth, wires cron jobs (Gmail polling, notification
  cron, automations cron), serves the built client, and holds
  team/invitation/activity-log endpoints inline. When adding a new
  cross-cutting endpoint, prefer creating a new file under `server/routes/`
  and mounting it here rather than growing this file further.
- `server/routes/*.js` — one router per domain (`shows`, `artists`, `crew`,
  `tasks`, `calendar`, `documents`, `drive`, `templates`, `notifications`,
  `automations`, `tech-spec`, `spotify`, `import`, `timelog`, …). Anything
  domain-specific belongs in its own router.
- `server/auth.js` — cookie-based session auth. Token format:
  `base64url(payload).base64url(hmac-sha256)`, HMAC secret derived from
  `AUTH_PASSWORD` (rotating the password invalidates all sessions).
  Supports admin (from env `AUTH_USER`/`AUTH_PASSWORD`) and external users
  (stored in `users.json`, PBKDF2-hashed) plus TOTP 2FA.
- `server/cache.js` — shared in-memory `node-cache`. GET routes use
  `readJsonCached(key, path, fallback)`; **writers must call
  `writeJsonAndCache` or `invalidate(key)` after mutating** or the next read
  returns stale data. The cache is constructed with `stdTTL: 0` (entries never
  expire by time — invalidation is explicit) and `useClones: true`, so `get`
  hands back a deep clone and mutating a returned value does *not* change what
  is cached. Note the comment above that line in `cache.js` still describes
  `useClones: false`; the comment is stale, the constructor is authoritative.
- `server/pdf.js` — singleton `puppeteer-core` browser. Chrome path is
  resolved lazily on first PDF request (NOT at import) so the Nix `PATH` is
  ready. On Linux it also registers the bundled `assets/Heebo.ttf` via
  fontconfig before launching Chromium — Railway's image has no Hebrew
  fonts, and the PDF template also embeds Heebo as a base64 `@font-face`
  (`server/routes/shows.js`) for double coverage.
- `server/gmail-poll.js` — hourly Gmail poller (Sun–Thu 08:00–21:00
  Israel time) that ingests an XLSX schedule attached to emails from an
  allow-listed sender set and turns them into shows.
- `server/utils/googleAuth.js` — **single shared Google auth** for Drive/Docs
  used by Brief creation, PDF logo export, and Setlist export. Details and
  operational notes are in the dedicated section below.
- `server/utils/userData.js` — see multi-tenancy note below. Everything that
  reads/writes a user's data goes through `dataPath(userId, file)` and
  `cacheKey(userId, name)`.
- `server/backup.js` — scheduled archiving of `DATA_DIR` to the volume and to
  Google Drive, plus failure alerting. Details are in the dedicated section
  below.

### Data layout & multi-tenancy

There is no DB — every entity is a JSON file. The layout is critical:

- `DATA_DIR/shows.json`, `crew.json`, `tasks.json`, … — the **admin's**
  data. Preserved as-is for backward compatibility.
- `DATA_DIR/artists/{artistId}/…` — admin's data scoped to one artist.
- `DATA_DIR/users/{userId}/…` — external user's data.
- `DATA_DIR/users/{userId}/artists/{artistId}/…` — external user + artist.

The active identity is encoded as a compound string using
`ARTIST_SEP = '__art__'`: e.g. `abc123__art__xyz`. `parseUserId()` splits it
back into `{ realUserId, artistId }`. Routes accept an `?artistId=...` query
param and construct the scoped id via `artistScopedId(userId, artistId)`.
When touching any per-user file, use the `dataPath`/`cacheKey` helpers — never
hard-code paths.

Runtime data files under `server/data/` are gitignored (see `.gitignore`);
they only exist on the local Mac and on the Railway volume. DOCX templates
under `server/data/*.docx` are the exception and *are* tracked.

### Client (`client/`)

- React 18 + Vite 5, no TypeScript, no React Router. Navigation is driven
  by a `page` state variable in `App.jsx`.
- `client/src/App.jsx` (~2000 lines) is the top-level orchestrator: holds
  all major data slices in state (`shows`, `crew`, `templates`, `artists`,
  etc.), fetches them via stable `useCallback` fetchers, and passes them
  into the page components. Multi-artist support uses a `currentArtistRef`
  ref so those stable fetchers can still append `?artistId=` without being
  re-created on every artist switch (see the block near lines 44–80).
- `client/src/components/` — one large component per page/feature
  (`ShowList`, `ShowForm`, `Dashboard`, `TeamPanel`, `TeamsPage`,
  `SetlistCalculator`, `TechSpecParser`, `TimeLog`, `TaskManager`,
  `CrewManager`, plus `automations/` and `backliner/` subfolders and a
  small `ui/` primitives folder).
- `client/src/utils/pushSubscribe.js` handles Web Push subscription
  (paired with `web-push` on the server + `notifications.js` cron).

## Backups, version history & write safety

There is no database, so the Railway volume is the only live copy of every
show, crew member, task and user. Three separate mechanisms protect it, and
they cover **different** failure modes — don't treat any one as a substitute
for the others.

### 1. Archives — losing the volume (`server/backup.js`)

Zips `DATA_DIR` and stores it in two places. Started from `server/index.js`
via `startSchedule()` at boot; needs `node-cron` (absent → scheduling silently
no-ops).

- **Every 6 hours**, `30 */6 * * *`, `Asia/Jerusalem`. Not nightly: a daily
  archive means losing the volume at 20:00 costs a full day's work.
- On the volume at `DATA_DIR/_backups/production-hub_<ts>.zip`, keeping the
  newest `BACKUP_KEEP_LOCAL` (default 7).
- To Google Drive in folder `BACKUP_DRIVE_FOLDER` (default
  `Production Hub Backups`), keeping `BACKUP_KEEP_REMOTE` (default 30). This
  reuses `getGoogleAuth()` — **the same OAuth token as Brief/PDF export, so
  that token dying takes the off-site copy with it.**
- The two targets are independent: a Drive failure still leaves the local
  snapshot, and the run is recorded rather than lost.
- **Never archived:** `gmail-token.json`, `gmail-credentials.json`,
  `service-account.json` (re-obtainable, and excluding them limits the damage
  if an archive leaks), `demo.json`, and the `_backups` / `_versions` /
  `node_modules` directories.

Failure is made loud on purpose. `runBackup` emails `BACKUP_ALERT_EMAIL`
(falling back to `GMAIL_USER`) on **any degradation — including a successful
local snapshot whose Drive upload failed**, because local-only looks healthy
right up until the volume is gone. A separate watchdog at 10:00 daily emails
if `status().stale` (no successful run in >48h). Status is written to
`DATA_DIR/_backups/status.json`.

Admin endpoints in `server/index.js`: `GET /api/admin/backup-status`,
`POST /api/admin/backup/run` (manual run), `GET /api/admin/backup/download`.

### 2. Version history — undoing a bad edit (`server/cache.js`)

An archive taken every 6h cannot recover a show deleted at 15:00 and noticed
at 15:10. So **before every overwrite** the file's previous contents are
gzipped to `DATA_DIR/_versions/<mangled-rel-path>/<timestamp>.json.gz`,
keeping the newest `KEEP_VERSIONS` (default 40) per file. Gzip is not
incidental — `shows.json` is ~2.6 MB raw and compresses roughly 10×.

Set `VERSIONS=off` to disable. Snapshotting is best-effort and wrapped in
`try/catch`: **version bookkeeping must never block or fail a real write.**
`_versions` is deliberately excluded from the archives — it would multiply
their size and it guards a different failure.

### 3. Write safety — never corrupting a file in the first place

Both in `server/cache.js`, and both matter when editing any write path:

- **Atomic writes.** `writeJsonAtomic` / `writeJsonAtomicSync` write to
  `<file>.<pid>.<ts>.tmp` and then `rename()` over the target. Rename is
  atomic at the filesystem level, so a crash can never leave a half-written,
  unparseable JSON file. The sync variant exists for config-ish call sites
  (users, teams, invitations, activity log) that aren't async.
- **Per-file serialization.** `withFileLock(path, fn)` chains work on the same
  path through one promise. Everything is a single Node process, but requests
  and the cron jobs (gmail-poll, automations, notifications) interleave at
  every `await` — without this, two read-modify-write cycles on `shows.json`
  silently lose one another's updates.

### Restoring

`server/scripts/restore-backup.js <archive.zip> [--target <dir>] [--force]`.
Before overwriting it snapshots the current target to
`<target>/_pre-restore_<ts>.zip`, so **the restore itself is undoable**.
`--force` is required for a non-empty target; `--target` lets you rehearse
into a scratch directory without touching live data — do that rather than
trusting an untested archive.

**Do not confuse this with `server/scripts/restore-data.js`**, which is the
opposite direction: it uploads your local `server/data` to a deployment.

### Stale comments to be aware of

Two in-code comments predate the 6-hour schedule and still say "daily": the
header block of `server/backup.js` ("What it does, daily") and the
`startSchedule()` call site in `server/index.js` ("daily 03:30"). The cron
expression is authoritative.

## Google Drive/Docs auth (Brief, PDF, Setlist export)
`server/utils/googleAuth.js` is the single shared auth source for these three
routes (`shows.js`, `drive.js`, `documents.js`). It prefers a Service Account
key (`SERVICE_ACCOUNT_KEY` env var or `DATA_DIR/service-account.json`), falling
back to a user OAuth refresh-token flow if none is configured.

**Service accounts do NOT work for this app and should not be revisited** —
tried 2026-07-01. The target Google account (`zlilmargalit0@gmail.com`) is a
personal, non-Workspace account. A service account has zero Drive storage
quota of its own; even with the target folder shared as Editor, creating any
file fails with "The user's Drive storage quota has been exceeded" — quota is
charged to the file's creator, not the folder owner, and cross-domain
ownership transfer (service account → personal Gmail) is blocked by Google
entirely. This only becomes viable if the account is upgraded to Google
Workspace (Shared Drive, or domain-wide delegation) — not worth pushing for
casually. The `googleAuth.js` service-account code path is dead but harmless;
leave it in place in case that upgrade ever happens.

**Current setup: OAuth refresh-token flow, currently working (pushed
2026-07-01).** Credentials/token live on the Railway volume at
`/data/gmail-credentials.json` / `/data/gmail-token.json` (confirmed a real
persistent volume is mounted there, not the ephemeral container FS — survives
redeploys). `getGoogleAuth()` forces a real refresh from `refresh_token` on
every call (never trusts the stored `expiry_date`) and persists any rotated
token back to the volume.

**Why this kept breaking weekly, and how to avoid it recurring:**
1. The OAuth consent screen was in "Testing" mode → refresh tokens expire
   after 7 days. Fixed: consent screen is now published to Production.
2. Google silently revokes the *oldest* refresh token once more than 50
   accumulate for the same OAuth client/user pair. This was likely caused by
   repeatedly re-running the consent/login flow during past debugging.
   **Do not re-authenticate Google for this app (no new consent-flow login)
   unless the Brief/PDF/Setlist-export genuinely breaks again with a real
   "Google authorization expired" error** — let the existing forced-refresh
   logic handle it. Each fresh login mints a new refresh_token and pushes
   another old one toward invalidation.
3. If it does break again: check `/api/admin/google-status` (or just try
   Brief) for the exact error, generate one fresh token locally
   (`node server/scripts/gmail-auth.js` or equivalent), verify it refreshes
   locally first, then push via `POST /api/admin/google-token` +
   `POST /api/admin/google-credentials` (admin-only, body = raw JSON) —
   either through the Railway app's own DevTools console (same-origin fetch,
   session cookie auto-included), or by running
   `node scripts/push-google-token.js` which logs in with the local
   `server/.env` credentials and pushes both files in one shot.

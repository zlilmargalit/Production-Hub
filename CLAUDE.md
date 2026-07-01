# Production Hub — Claude Instructions

## Language Rule
Always respond in English only, regardless of what language the user writes in.

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
   `POST /api/admin/google-credentials` (admin-only, body = raw JSON) — via
   the Railway app's own DevTools console (same-origin fetch, session cookie
   auto-included) since there's no other way to reach the live admin API.

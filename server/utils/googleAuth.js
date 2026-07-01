// Shared Google Drive/Docs auth for Brief creation, PDF logo export, and
// Setlist export to Drive.
//
// Preferred path — Service Account (permanent, zero maintenance):
//   A service account key never expires and needs no refresh flow at all,
//   so this eliminates the recurring "Google authorization expired" failure
//   for good. Configure via SERVICE_ACCOUNT_KEY (Railway env var, raw JSON)
//   or server/data/service-account.json (local file, gitignored).
//   One-time setup: share the target Drive folder(s) with the service
//   account's `client_email` as Editor, exactly like sharing with any other
//   Google account.
//
// Fallback path — user OAuth refresh token (legacy):
//   Used only if no service account is configured. This is the mechanism
//   that breaks every time the refresh token dies (7-day expiry in Testing
//   mode, the 50-refresh-token-per-client cap, manual re-auth elsewhere).
//   Kept only so nothing breaks mid-migration.

const fs   = require('fs');
const fsp  = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');

const DATA_DIR = require('./userData').DATA_DIR;

const SERVICE_ACCOUNT_PATH = path.join(DATA_DIR, 'service-account.json');
const CREDENTIALS_PATH     = path.join(__dirname, '../data/gmail-credentials.json');
const TOKEN_PATH           = path.join(__dirname, '../data/gmail-token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

function isServiceAccountConfigured() {
  return !!process.env.SERVICE_ACCOUNT_KEY || fs.existsSync(SERVICE_ACCOUNT_PATH);
}

let _cachedSaClient = null;
async function getServiceAccountAuth() {
  if (_cachedSaClient) return _cachedSaClient;
  const key = process.env.SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.SERVICE_ACCOUNT_KEY)
    : JSON.parse(await fsp.readFile(SERVICE_ACCOUNT_PATH, 'utf8'));
  const auth = new google.auth.GoogleAuth({ credentials: key, scopes: SCOPES });
  const client = await auth.getClient();
  // Force the JWT to actually sign and fetch a token now, inside this function's
  // try/catch in getGoogleAuth(). getClient() alone builds the client lazily and
  // wouldn't surface a bad/malformed key until the first real Drive/Docs call —
  // by then it's outside our error handling and the OAuth fallback never fires.
  await client.getAccessToken();
  _cachedSaClient = client;
  return _cachedSaClient;
}

// ── Legacy OAuth refresh-token path (fallback only) ─────────────────────────
async function getOAuthUserAuth() {
  const volumeCredsPath = path.join(DATA_DIR, 'gmail-credentials.json');
  const volumeTokenPath = path.join(DATA_DIR, 'gmail-token.json');

  let creds, tokens;

  if (fs.existsSync(volumeCredsPath)) {
    creds = JSON.parse(await fsp.readFile(volumeCredsPath, 'utf8'));
  } else if (process.env.GMAIL_CREDENTIALS) {
    creds = JSON.parse(process.env.GMAIL_CREDENTIALS);
  } else {
    creds = JSON.parse(await fsp.readFile(CREDENTIALS_PATH, 'utf8'));
  }

  if (fs.existsSync(volumeTokenPath)) {
    tokens = JSON.parse(await fsp.readFile(volumeTokenPath, 'utf8'));
  } else if (process.env.GMAIL_TOKEN) {
    tokens = JSON.parse(process.env.GMAIL_TOKEN);
  } else {
    tokens = JSON.parse(await fsp.readFile(TOKEN_PATH, 'utf8'));
  }

  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;

  // Force a real refresh from the refresh_token rather than trusting the
  // stored access_token/expiry_date (see server/routes/shows.js history).
  const refreshClient = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  refreshClient.setCredentials({ ...tokens, expiry_date: 1 });
  refreshClient.on('tokens', (newTokens) => {
    const dest   = path.join(DATA_DIR, 'gmail-token.json');
    const merged = { ...tokens, ...newTokens };
    fsp.writeFile(dest, JSON.stringify(merged, null, 2), 'utf8')
      .then(() => console.log('[googleAuth] OAuth token auto-refreshed and saved to volume'))
      .catch((e) => console.warn('[googleAuth] could not save refreshed token:', e.message));
  });

  let accessToken;
  if (tokens.refresh_token) {
    const result = await refreshClient.getAccessToken();
    if (!result || !result.token) throw new Error('no access token returned');
    accessToken = result.token;
  } else {
    accessToken = tokens.access_token;
  }

  const staticClient = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  staticClient.setCredentials({ access_token: accessToken });
  return staticClient;
}

// ── Public entry point ──────────────────────────────────────────────────────
// Used by shows.js (Brief + PDF), drive.js (Setlist export) and documents.js.
async function getGoogleAuth() {
  if (isServiceAccountConfigured()) {
    try {
      return await getServiceAccountAuth();
    } catch (e) {
      console.error('[googleAuth] Service account auth failed, falling back to OAuth:', e.message);
    }
  }
  try {
    return await getOAuthUserAuth();
  } catch (e) {
    const detail = e?.response?.data?.error_description || e?.response?.data?.error || e.message;
    console.error('[googleAuth] OAuth refresh failed:', detail);
    throw new Error('Google authorization expired — reconnect Google to use Brief/Export. (' + detail + ')');
  }
}

module.exports = {
  getGoogleAuth,
  isServiceAccountConfigured,
  SERVICE_ACCOUNT_PATH,
};

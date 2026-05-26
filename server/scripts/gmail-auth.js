/**
 * One-time Gmail OAuth authorization.
 * Run this once to authorize the server to access Gmail:
 *
 *   node server/scripts/gmail-auth.js
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/
 *   2. Create (or select) a project
 *   3. Enable the Gmail API
 *   4. Create OAuth 2.0 credentials → Desktop app
 *   5. Download the JSON file and save it as:
 *        server/data/gmail-credentials.json
 *   6. Run this script and follow the instructions
 */

const { google } = require('googleapis');
const readline   = require('readline');
const fs         = require('fs');
const path       = require('path');

const CREDENTIALS_PATH = path.join(__dirname, '../data/gmail-credentials.json');
const TOKEN_PATH       = path.join(__dirname, '../data/gmail-token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('\nError: gmail-credentials.json not found at:');
    console.error(' ', CREDENTIALS_PATH);
    console.error('\nDownload OAuth 2.0 credentials from Google Cloud Console (Desktop app type)');
    console.error('and save the file at the path above.\n');
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force refresh token even if previously authorized
  });

  console.log('\nOpen this URL in your browser to authorize Gmail access:\n');
  console.log(authUrl);
  console.log('\nAfter authorizing, paste the FULL URL from the browser address bar below');
  console.log('(the one that starts with http://localhost/?code=...)\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('URL or code: ', async (input) => {
    rl.close();
    // Accept either the full redirect URL or just the bare code
    let code = input.trim();
    try {
      const url = new URL(code);
      code = url.searchParams.get('code') || code;
    } catch (_) { /* not a URL, use as-is */ }
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('\nDone! Token saved to:', TOKEN_PATH);
      console.log('Restart the server — Gmail auto-import is now active.\n');
    } catch (err) {
      console.error('\nFailed to exchange code for token:', err.message);
    }
    process.exit(0);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });

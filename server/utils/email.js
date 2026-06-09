// Shared Gmail send helper — usable from cron jobs and routes.
// Mirrors the OAuth setup in server/index.js (getGmailOAuth / sendGmail) so the
// notification engine can send email without depending on index.js internals.

const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');

const GMAIL_CREDENTIALS_PATH = path.join(__dirname, '..', 'data', 'gmail-credentials.json');
const GMAIL_TOKEN_PATH       = path.join(__dirname, '..', 'data', 'gmail-token.json');

function emailConfigured() {
  if (process.env.GMAIL_CREDENTIALS && process.env.GMAIL_TOKEN) return true;
  return fs.existsSync(GMAIL_CREDENTIALS_PATH) && fs.existsSync(GMAIL_TOKEN_PATH);
}

function getGmailOAuth() {
  const creds = process.env.GMAIL_CREDENTIALS
    ? JSON.parse(process.env.GMAIL_CREDENTIALS)
    : JSON.parse(fs.readFileSync(GMAIL_CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const tokens = process.env.GMAIL_TOKEN
    ? JSON.parse(process.env.GMAIL_TOKEN)
    : JSON.parse(fs.readFileSync(GMAIL_TOKEN_PATH, 'utf8'));
  auth.setCredentials(tokens);
  return auth;
}

// Send a plain-text email via the Gmail API. Subject is UTF-8 encoded so Hebrew
// renders correctly in the header.
async function sendEmail(to, subject, textBody) {
  if (!emailConfigured()) throw new Error('Gmail is not configured on this server');
  const auth  = getGmailOAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const raw = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    textBody,
  ].join('\r\n');
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(raw).toString('base64url') },
  });
}

module.exports = { sendEmail, emailConfigured };

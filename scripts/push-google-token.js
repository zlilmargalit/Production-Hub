/**
 * push-google-token.js
 * Pushes the local Google credentials + token to Railway's persistent volume
 * so the brief/Drive integration works without a full re-deploy.
 *
 * Usage:
 *   node scripts/push-google-token.js
 *
 * Reads credentials from server/.env automatically.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Read .env ──────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '../server/.env');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  });
}

const RAILWAY_URL = env.RAILWAY_URL || 'https://production-hub-production-0fb6.up.railway.app';
const AUTH_USER   = env.AUTH_USER   || process.env.AUTH_USER;
const AUTH_PASS   = env.AUTH_PASSWORD || process.env.AUTH_PASSWORD;

if (!AUTH_USER || !AUTH_PASS) {
  console.error('ERROR: AUTH_USER / AUTH_PASSWORD not found in server/.env');
  process.exit(1);
}

// ── Read local credentials ─────────────────────────────────────────────────
const credsPath = path.join(__dirname, '../server/data/gmail-credentials.json');
if (!fs.existsSync(credsPath)) {
  console.error('ERROR: server/data/gmail-credentials.json not found');
  process.exit(1);
}
const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

// ── Read local token ───────────────────────────────────────────────────────
const tokenPath = path.join(__dirname, '../server/data/gmail-token.json');
if (!fs.existsSync(tokenPath)) {
  console.error('ERROR: server/data/gmail-token.json not found');
  process.exit(1);
}
const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
if (!token.refresh_token) {
  console.error('ERROR: local token has no refresh_token — re-run auth locally first');
  process.exit(1);
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const host = RAILWAY_URL.replace('https://', '');

  // ── Step 1: Login ──────────────────────────────────────────────────────
  console.log(`Logging in to ${RAILWAY_URL} as ${AUTH_USER}...`);
  const params   = `username=${encodeURIComponent(AUTH_USER)}&password=${encodeURIComponent(AUTH_PASS)}`;
  const loginRes = await request({
    hostname: host, path: '/login', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params) },
  }, params);

  if (loginRes.status !== 302 && loginRes.status !== 200) {
    console.error('Login failed:', loginRes.status, loginRes.body.slice(0, 200));
    process.exit(1);
  }

  const cookies = (loginRes.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  if (!cookies) {
    console.error('No session cookie returned from login');
    process.exit(1);
  }
  console.log('Logged in.');

  // ── Step 2: Push credentials ───────────────────────────────────────────
  console.log('Pushing Google credentials to Railway volume...');
  const credsBody = JSON.stringify(creds);
  const credsRes  = await request({
    hostname: host, path: '/api/admin/google-credentials', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(credsBody),
      'Cookie': cookies,
    },
  }, credsBody);

  if (credsRes.status !== 200) {
    console.error('Credentials push failed:', credsRes.status, credsRes.body);
    process.exit(1);
  }
  console.log('Credentials pushed:', JSON.parse(credsRes.body).written);

  // ── Step 3: Push token ─────────────────────────────────────────────────
  console.log('Pushing fresh Google token to Railway volume...');
  const tokenBody = JSON.stringify(token);
  const pushRes   = await request({
    hostname: host, path: '/api/admin/google-token', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(tokenBody),
      'Cookie': cookies,
    },
  }, tokenBody);

  if (pushRes.status !== 200) {
    console.error('Token push failed:', pushRes.status, pushRes.body);
    process.exit(1);
  }
  console.log('Token pushed:', JSON.parse(pushRes.body).written);
  console.log('Done. The brief should now work on Railway.');
})();

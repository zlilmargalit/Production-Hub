#!/usr/bin/env node
// One-time data restore script.
// Reads local server/data/ files and uploads them to a Railway deployment.
//
// Usage:
//   node server/scripts/restore-data.js <RAILWAY_URL> <ADMIN_PASSWORD>
//
// Example:
//   node server/scripts/restore-data.js https://production-hub-xxx.up.railway.app mypassword

const fs   = require('fs');
const path = require('path');
const http = require('https');
const url  = require('url');

const [,, RAILWAY_URL, PASSWORD] = process.argv;

if (!RAILWAY_URL || !PASSWORD) {
  console.error('Usage: node server/scripts/restore-data.js <RAILWAY_URL> <ADMIN_PASSWORD>');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, '../data');

// Files to restore (relative paths from DATA_DIR)
function collectFiles(dir, base = '') {
  const result = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, collectFiles(fullPath, relPath));
    } else if (entry.name.endsWith('.json') && !['gmail-credentials.json', 'gmail-token.json', 'demo.json'].includes(entry.name)) {
      result[relPath] = fs.readFileSync(fullPath, 'utf8');
    }
  }
  return result;
}

function request(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? require('https') : require('http');
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      ...options,
    };
    const req = mod.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const base = RAILWAY_URL.replace(/\/$/, '');
  const username = process.env.AUTH_USER || 'zlilmargalit';

  console.log(`Connecting to: ${base}`);
  console.log(`Logging in as: ${username}`);

  // Step 1: Login to get session cookie
  const loginBody = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(PASSWORD)}`;
  const loginRes = await request(`${base}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(loginBody),
    },
  }, loginBody);

  const setCookie = loginRes.headers['set-cookie'];
  if (!setCookie || loginRes.status >= 400) {
    console.error('Login failed:', loginRes.status, loginRes.body.slice(0, 200));
    process.exit(1);
  }

  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  console.log('Login successful.');

  // Step 2: Collect local data files
  console.log(`Reading data from: ${DATA_DIR}`);
  const files = collectFiles(DATA_DIR);
  const fileNames = Object.keys(files);
  console.log(`Found ${fileNames.length} files to restore:`);
  fileNames.forEach((f) => console.log(`  ${f}`));

  // Step 3: POST to restore endpoint
  const payload = JSON.stringify({ files });
  console.log(`\nUploading ${(Buffer.byteLength(payload) / 1024).toFixed(1)} KB…`);

  const restoreRes = await request(`${base}/api/admin/restore-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Cookie': cookie,
    },
  }, payload);

  if (restoreRes.status !== 200) {
    console.error('Restore failed:', restoreRes.status, restoreRes.body.slice(0, 500));
    process.exit(1);
  }

  const result = JSON.parse(restoreRes.body);
  console.log(`\nRestore complete: ${result.written} files written to Railway volume.`);
  console.log('Reload the app in your browser to see your data.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

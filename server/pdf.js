// Singleton Puppeteer browser used to render PDFs.
//
// We use puppeteer-core (no bundled Chromium) and discover the Chrome/Chromium
// binary at first launch — NOT at module-load time — so the Nix PATH is fully
// initialised.
//
// Bug fixed: the old IIFE returned the bare string 'chromium' when the binary
// was runnable in PATH but `which` didn't return an absolute path.
// puppeteer-core does existsSync(executablePath) and 'chromium' as a relative
// path always fails that check → "Browser was not found at the configured
// directory."  We now always resolve to an absolute path or throw clearly.

const puppeteer = require('puppeteer-core');
const fss       = require('fs');
const { execSync } = require('child_process');

// ── Chrome path resolution (lazy — runs once on first PDF request) ──────────

let _chromePath = null; // cached after first resolution

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', shell: '/bin/sh' }).trim();
  } catch {
    return null;
  }
}

// Scan the Nix store directly for a runnable chromium wrapper. On nixpacks
// runtime the `default` profile symlink and even PATH frequently don't include
// the build-time packages, so /nix/store is the only reliable source. We prefer
// the *wrapped* `chromium` (sets up LD_LIBRARY_PATH/fontconfig) over the bare
// `chromium-unwrapped`, which can't launch on its own.
function scanNixStore() {
  let entries;
  try { entries = fss.readdirSync('/nix/store'); } catch { return null; }
  const cands = entries
    .filter((n) => /chromium/i.test(n) && !/unwrapped/i.test(n))
    .map((n) => `/nix/store/${n}/bin/chromium`)
    .filter((p) => fss.existsSync(p));
  if (cands.length) {
    // Newest-looking last; any working wrapper is fine.
    return cands.sort().pop();
  }
  return null;
}

function resolveChromePath() {
  // Explicit override wins — but ONLY if it actually exists. A stale/wrong
  // CHROME_PATH (e.g. a profile symlink that nixpacks doesn't create at
  // runtime) would otherwise be handed to puppeteer-core, which then throws
  // "Browser was not found at the configured executablePath".
  if (process.env.CHROME_PATH) {
    if (fss.existsSync(process.env.CHROME_PATH)) {
      console.log(`[pdf] Chrome via CHROME_PATH: ${process.env.CHROME_PATH}`);
      return process.env.CHROME_PATH;
    }
    console.warn(`[pdf] CHROME_PATH set but not found on disk (${process.env.CHROME_PATH}) — ignoring and auto-discovering.`);
  }

  // macOS: local Chrome
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }

  // Linux / Railway (nixpacks installs `chromium`).
  // Strategy: always resolve to an ABSOLUTE path — puppeteer-core requires it.
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
    // realpath follows symlinks → actual binary in the nix store
    const rp = sh(`realpath "$(which ${bin} 2>/dev/null)" 2>/dev/null`);
    if (rp && fss.existsSync(rp)) {
      console.log(`[pdf] Chrome via realpath: ${rp}`);
      return rp;
    }

    // which alone (symlink is fine for puppeteer-core as long as it exists)
    const wp = sh(`which ${bin} 2>/dev/null`);
    if (wp && fss.existsSync(wp)) {
      console.log(`[pdf] Chrome via which: ${wp}`);
      return wp;
    }
  }

  // Known absolute paths for nixpacks / common Linux installs
  for (const abs of [
    '/nix/var/nix/profiles/default/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/local/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ]) {
    if (fss.existsSync(abs)) {
      console.log(`[pdf] Chrome at: ${abs}`);
      return abs;
    }
  }

  // Last resort on nixpacks: walk the Nix store for a wrapped chromium binary.
  const nixHit = scanNixStore();
  if (nixHit) {
    console.log(`[pdf] Chrome via /nix/store scan: ${nixHit}`);
    return nixHit;
  }

  // Nothing found — throw a clear error rather than passing a non-path string
  throw new Error(
    'Chromium/Chrome not found on this server. ' +
    'nixpacks should install it via nixPkgs=["chromium"]; verify the build, ' +
    'or set CHROME_PATH to an existing chromium binary.'
  );
}

function getChromePath() {
  if (!_chromePath) _chromePath = resolveChromePath();
  return _chromePath;
}

// ── Singleton browser ────────────────────────────────────────────────────────

let browserPromise = null;

async function launchBrowser() {
  const cp = getChromePath();
  console.log('[pdf] Launching browser:', cp);
  const browser = await puppeteer.launch({
    executablePath: cp,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',   // required in Railway/Docker containers
      '--no-zygote',
    ],
  });
  browser.on('disconnected', () => { browserPromise = null; });
  return browser;
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

// ── Render HTML → PDF Buffer ─────────────────────────────────────────────────

async function htmlToPdfBuffer(html, options = {}) {
  // Two attempts: on the first failure (stale singleton) recycle the browser
  // and retry once with a fresh launch.
  for (let attempt = 0; attempt < 2; attempt++) {
    const browser = await getBrowser();
    const page    = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 45000 });
      const buffer = await page.pdf({
        format:          options.format || 'A4',
        printBackground: true,
        margin:          options.margin || { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: true,
        ...options.pdf,
      });
      await page.close().catch(() => {});
      return buffer;
    } catch (err) {
      await page.close().catch(() => {});
      if (attempt === 0) {
        console.warn('[pdf] attempt 1 failed, recycling browser:', err.message);
        browserPromise = null;
        try { await browser.close(); } catch {}
      } else {
        throw err;
      }
    }
  }
}

async function shutdown() {
  if (!browserPromise) return;
  try { const b = await browserPromise; await b.close(); } catch {}
  browserPromise = null;
}

module.exports = { getBrowser, htmlToPdfBuffer, shutdown };

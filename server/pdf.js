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

// puppeteer-core v23+ ships as an ES module with NO CommonJS build, so a static
// `require('puppeteer-core')` throws ERR_REQUIRE_ESM under Node < 20.19 / 22.12.
// We load it lazily via dynamic import() inside the async launch path, which is
// supported from CommonJS on every Node version.
let _puppeteer = null;
async function loadPuppeteer() {
  if (!_puppeteer) {
    const mod = await import('puppeteer-core');
    _puppeteer = mod.default || mod;
  }
  return _puppeteer;
}
const fss       = require('fs');
const path      = require('path');
const { execSync } = require('child_process');

// ── Hebrew font for headless Chromium ────────────────────────────────────────
// Railway's nixpacks image ships NO Hebrew-capable system font, so Chromium
// renders Hebrew text as invisible glyphs ("boxes but no text"). Register the
// bundled Heebo font where fontconfig scans ($XDG_DATA_HOME/fonts and ~/.fonts)
// BEFORE launching Chromium, so Hebrew renders reliably regardless of the
// embedded @font-face. No-op on macOS (has Hebrew fonts).
let _fontReady = false;
function ensureHebrewFont() {
  if (_fontReady || process.platform === 'darwin') return;
  _fontReady = true;
  try {
    const src = path.join(__dirname, 'assets/Heebo.ttf');
    if (!fss.existsSync(src)) { console.warn('[pdf] Heebo.ttf missing — Hebrew may not render'); return; }
    const xdg = process.env.XDG_DATA_HOME || '/tmp/hub-xdg';
    const targets = [path.join(xdg, 'fonts')];
    if (process.env.HOME) targets.push(path.join(process.env.HOME, '.fonts'));
    for (const dir of targets) {
      try { fss.mkdirSync(dir, { recursive: true }); fss.copyFileSync(src, path.join(dir, 'Heebo.ttf')); } catch {}
    }
    process.env.XDG_DATA_HOME = xdg;
    try { execSync('fc-cache -f', { stdio: 'ignore' }); } catch {}
    console.log('[pdf] Registered Heebo Hebrew font for Chromium');
  } catch (e) {
    console.warn('[pdf] could not register Hebrew font:', e.message);
  }
}

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
  ensureHebrewFont();          // register Hebrew font before Chromium starts
  const cp = getChromePath();
  const puppeteer = await loadPuppeteer();
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

// Reject if a step hangs. page.pdf() takes no timeout option, so without this a
// wedged render leaves the HTTP request open forever — the user sees a spinner
// that never resolves and the page is never closed.
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Chromium runs with --single-process here, so parallel renders contend for one
// process and a burst can exhaust memory. Serialise: PDFs are infrequent and a
// short queue is far better than a crashed browser taking every request with it.
let _renderQueue = Promise.resolve();

async function htmlToPdfBuffer(html, options = {}) {
  const run = () => _htmlToPdfBuffer(html, options);
  const queued = _renderQueue.then(run, run);
  _renderQueue = queued.then(() => {}, () => {});   // keep the chain, swallow rejections
  return queued;
}

async function _htmlToPdfBuffer(html, options = {}) {
  const PDF_TIMEOUT_MS = Number(process.env.PDF_TIMEOUT_MS || 60_000);
  // Two attempts: on the first failure (stale singleton) recycle the browser
  // and retry once with a fresh launch.
  for (let attempt = 0; attempt < 2; attempt++) {
    const browser = await getBrowser();
    const page    = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 45000 });
      // Wait for embedded @font-face fonts to finish loading before capturing.
      // The 'load' event can fire before web fonts are ready; with the default
      // font-display: block the text stays invisible until the font loads, so
      // capturing too early yields a PDF with boxes but no glyphs. document.fonts.ready
      // resolves once all faces are loaded (or after a short timeout fallback).
      await Promise.race([
        page.evaluate('document.fonts.ready'),
        new Promise((r) => setTimeout(r, 3000)),
      ]).catch(() => {});
      const buffer = await withTimeout(page.pdf({
        format:          options.format || 'A4',
        printBackground: true,
        margin:          options.margin || { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: true,
        ...options.pdf,
      }), PDF_TIMEOUT_MS, 'PDF render');
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

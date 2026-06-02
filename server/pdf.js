// Singleton Puppeteer browser used to render PDFs.
//
// The old implementation spawned a fresh `google-chrome --headless --print-to-pdf`
// process per request — cold-start cost of ~3-5 s. Here we keep ONE browser
// alive for the life of the server, and just open a new page per request
// (typically <500 ms end-to-end).
//
// We use puppeteer-core (no bundled Chromium) and point it at the same Chrome
// binary the project already relies on via CHROME_PATH.

const puppeteer = require('puppeteer-core');

const CHROME_PATH = process.env.CHROME_PATH || (() => {
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  // On Railway / Nix: chromium is installed via nixpacks.toml.
  // Strategy:
  //   1. `which <bin>` → validate the path actually exists on disk
  //   2. Try known absolute paths (nixpacks nix store / system)
  //   3. Last resort: try executing `<bin> --version` to confirm it's runnable in PATH
  const fss = require('fs');
  const { execSync } = require('child_process');

  for (const bin of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
    // 1. which → absolute path that exists
    try {
      const p = execSync(`which ${bin}`, { encoding: 'utf8', stdio: 'pipe' }).trim();
      if (p && fss.existsSync(p)) { console.log(`[pdf] Found Chrome via which: ${p}`); return p; }
    } catch {}
    // 3. Binary runnable directly in PATH (existsSync('chromium') would fail, but spawn works)
    try {
      execSync(`${bin} --version`, { encoding: 'utf8', stdio: 'pipe' });
      console.log(`[pdf] Chrome runnable in PATH as: ${bin}`);
      return bin;
    } catch {}
  }
  // 2. Known absolute paths for nixpacks / common Linux installs
  for (const abs of [
    '/nix/var/nix/profiles/default/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/local/bin/chromium',
  ]) {
    if (fss.existsSync(abs)) { console.log(`[pdf] Found Chrome at absolute path: ${abs}`); return abs; }
  }
  console.warn('[pdf] Chrome not found — set CHROME_PATH env var on Railway. Attempting "chromium".');
  return 'chromium';
})();

console.log('[pdf] CHROME_PATH =', CHROME_PATH);

let browserPromise = null;

async function launchBrowser() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,           // 'new' is deprecated in puppeteer-core v22+
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',     // required in Railway/Docker containers
      '--no-zygote',
    ],
  });
  // If the browser dies (crash, OOM, manual kill), drop the cached promise so
  // the next request triggers a fresh launch instead of using a dead handle.
  browser.on('disconnected', () => {
    browserPromise = null;
  });
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

// Render an HTML string to a PDF Buffer. Format/margins match the previous
// Chrome --print-to-pdf defaults so the visual output is unchanged.
async function htmlToPdfBuffer(html, options = {}) {
  // Two attempts: on the first failure (stale singleton browser) we close the
  // browser, clear the promise, and retry once with a fresh launch.
  for (let attempt = 0; attempt < 2; attempt++) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      // 'networkidle0' is more reliable than 'load' for self-contained HTML
      // that embeds images as data-URLs — no external network requests means
      // the idle condition is met immediately after the DOM is painted.
      await page.setContent(html, { waitUntil: 'load', timeout: 45000 });
      const buffer = await page.pdf({
        format: options.format || 'A4',
        printBackground: true,
        margin: options.margin || { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: true,
        ...options.pdf,
      });
      return buffer;
    } catch (err) {
      await page.close().catch(() => {});
      if (attempt === 0) {
        // Stale browser — force a fresh launch on the next attempt.
        console.warn('[pdf] setContent failed (attempt 1), recycling browser:', err.message);
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
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {}
  browserPromise = null;
}

module.exports = { getBrowser, htmlToPdfBuffer, shutdown };

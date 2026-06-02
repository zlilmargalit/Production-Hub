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
  // On Railway / Nix the package is called 'chromium', not 'google-chrome'.
  // Resolve the actual binary path at start-up via PATH lookup.
  const { execSync } = require('child_process');
  for (const bin of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
    try {
      const p = execSync(`which ${bin}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (p) { console.log(`[pdf] Found Chrome at: ${p}`); return p; }
    } catch { /* try next */ }
  }
  console.log('[pdf] Chrome not found via which, falling back to "chromium" in PATH');
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
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
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

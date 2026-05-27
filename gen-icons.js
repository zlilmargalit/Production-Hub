// Generates PWA + iOS icons for Production Hub using the Spot Pool SVG mark.
// Run from the repo root: node gen-icons.js
// Requires puppeteer-core (already in server/node_modules) + Chrome.

const puppeteer = require('./server/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, 'client/public');

const SIZES = [
  { file: 'icon-512.png',         size: 512 },
  { file: 'icon-192.png',         size: 192 },
  { file: 'icon-180.png',         size: 180 },
  { file: 'apple-touch-icon.png', size: 180 },
];

// Spot Pool mark — fills the icon frame with proper padding.
// The "floor" focus point sits at 65% down; arcs open upward and fill ~80% width.
function iconHtml(px) {
  const cx   = px / 2;               // horizontal centre
  const cy   = px * 0.65;            // floor / focus point
  const pad  = px * 0.06;            // edge padding (6%)
  const r1   = cx - pad;             // outer radius — nearly full half-width
  const r2   = r1 * 0.63;            // middle radius
  const r3   = r1 * 0.33;            // inner radius
  const dotR = Math.max(3, r1 * 0.085);   // performer dot

  // stroke widths scale with icon size
  const sw1 = Math.max(1, px * 0.0045);
  const sw2 = Math.max(1, px * 0.005);
  const sw3 = Math.max(1, px * 0.007);
  const swF = Math.max(1, px * 0.003);

  const arc = (r) =>
    `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${px}px; height:${px}px; overflow:hidden; background:#181A2E; }
</style>
</head>
<body>
<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${px}" height="${px}" rx="${px * 0.18}" fill="#181A2E"/>

  <!-- outer arc -->
  <path d="${arc(r1)}" stroke="rgba(255,255,255,0.32)" stroke-width="${sw1}" stroke-linecap="round" fill="none"/>
  <!-- middle arc -->
  <path d="${arc(r2)}" stroke="rgba(255,255,255,0.60)" stroke-width="${sw2}" stroke-linecap="round" fill="none"/>
  <!-- inner arc -->
  <path d="${arc(r3)}" stroke="rgba(255,255,255,0.90)" stroke-width="${sw3}" stroke-linecap="round" fill="none"/>

  <!-- floor line -->
  <line x1="${pad}" y1="${cy}" x2="${px - pad}" y2="${cy}"
        stroke="rgba(255,255,255,0.25)" stroke-width="${swF}" stroke-linecap="round"/>

  <!-- performer dot -->
  <circle cx="${cx}" cy="${cy}" r="${dotR}" fill="#F08D39"/>
</svg>
</body>
</html>`;
}

(async () => {
  console.log('Launching Chrome…');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const { file, size } of SIZES) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 2 }); // 2× for crispness
    await page.setContent(iconHtml(size), { waitUntil: 'domcontentloaded' });
    const out = path.join(OUT, file);
    await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`  ✓ ${file} (${size}×${size})`);
  }

  await browser.close();
  console.log('\nAll icons written to client/public/');
})().catch((e) => { console.error(e); process.exit(1); });

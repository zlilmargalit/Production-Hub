const express = require('express');
const router  = express.Router();

// ── Extract text from a base64-encoded PDF ────────────────────────────────────
async function extractPdfText(base64DataUrl) {
  const base64 = base64DataUrl.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  // pdf-parse can throw on malformed PDFs — let the caller handle it
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const result   = await pdfParse(buffer);
  return result.text || '';
}

// ── Heuristic equipment-item extractor ───────────────────────────────────────
function extractItems(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && l.length < 140);

  const EN_KEYWORDS = [
    'microphone', ' mic ', 'DI box', ' DI ', 'monitor', 'speaker', 'amplifier',
    ' amp ', 'cable', ' stand ', 'mixer', 'console', 'snake', 'subwoofer', ' sub ',
    'wedge', 'in-ear', 'IEM', 'keyboard', 'guitar', ' bass ', 'drum', 'stage box',
    'power strip', 'extension', 'SM58', 'SM57', 'Shure', 'Sennheiser', 'AKG',
    'phantom', 'preamp', 'XLR', 'jack ', 'plug ',
  ];
  const HE_KEYWORDS = [
    'מיקרופון', 'מיק', 'מוניטור', 'מגבר', 'כבל', 'עמדה', 'מיקסר', 'חצובה',
    'קיט', 'תוף', 'גיטרה', 'בס', 'קלידים', 'שנייזר', 'שור', 'דיאי',
    'ציוד', 'אמפ', 'רמקול', 'ספיקר', 'DI',
  ];
  const ALL_KEYWORDS = [...EN_KEYWORDS, ...HE_KEYWORDS];

  const seen    = new Set();
  const results = [];

  const push = (s) => {
    const clean = s.trim();
    if (clean.length < 3 || seen.has(clean)) return;
    seen.add(clean);
    results.push(clean);
  };

  for (const line of lines) {
    // Skip pure-uppercase lines that look like section headers (no digits)
    if (line === line.toUpperCase() && !/\d/.test(line) && line.length < 50) continue;
    // Skip obvious page meta
    if (/^(page\s*\d+|\d{1,3}$|tel[\s:]+|email[\s:]+|fax[\s:]+)/i.test(line)) continue;

    // "2×" / "2 x" / "2 ×" quantity prefix
    if (/^(\d+\s*[×x×]\s*)(.+)/i.test(line)) { push(line); continue; }

    // Numbered list: "1." or "1)"
    const num = line.match(/^\d+[.)]\s*(.{3,})/);
    if (num) { push(num[1]); continue; }

    // Bullet: "- " / "• " / "· " / "* " / "– "
    const bullet = line.match(/^[-•·*–]\s*(.{3,})/);
    if (bullet) { push(bullet[1]); continue; }

    // Keyword match
    const lower = line.toLowerCase();
    if (ALL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
      push(line);
    }
  }

  return results.slice(0, 80);
}

// ── POST /api/tools/tech-spec-parse ──────────────────────────────────────────
router.post('/tech-spec-parse', async (req, res) => {
  const { fileData } = req.body || {};
  if (!fileData) return res.status(400).json({ error: 'No file data provided' });

  try {
    const text  = await extractPdfText(fileData);
    const items = extractItems(text);
    res.json({ items });
  } catch (err) {
    console.error('[tech-spec-parse]', err.message);
    res.status(500).json({ error: 'Could not parse PDF: ' + err.message });
  }
});

module.exports = router;

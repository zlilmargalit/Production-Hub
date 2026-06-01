const express = require('express');
const router  = express.Router();

// ── Extract text from a base64-encoded PDF ────────────────────────────────────
async function extractPdfText(base64DataUrl) {
  const base64 = base64DataUrl.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const result   = await pdfParse(buffer);
  return result.text || '';
}

// ── Heuristic equipment extractor ────────────────────────────────────────────
function extractItems(text) {
  const lines = text.split('\n').map((l) => l.trim());

  // ── Section boundaries ──────────────────────────────────────────────────
  let backlineStart = -1;
  let inputListStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const up = lines[i].toUpperCase();
    if (backlineStart === -1 && /\bBACKLINE\b/.test(up)) backlineStart = i;
    if (backlineStart !== -1 && /\bINPUT\s*LIST\b/.test(up)) { inputListStart = i; break; }
  }

  // ── Input-list channel-row detector ────────────────────────────────────
  const isInputListRow = (line) => {
    if (!/^\d{1,2}\s/.test(line)) return false;
    if (/^\d+\s*[×xX]\s/i.test(line)) return false; // qty prefix → backline, not input ch
    if (/\b(SM91|SM57|SM58|SM\d+|Beta\s*\d+|D112|MD421|MD441|C414|AT\d+|e\d{3}|e906|e602|DPA)\b/i.test(line)) return true;
    return line.split(/\s+/).length >= 5;
  };

  // ── Keywords for backline / hardware items ──────────────────────────────
  // Note: 'cymbal', 'hi hat' omitted intentionally — caught by bullet prefix
  // and keeping them here causes false positives on spec/description lines.
  const BACKLINE_KW = [
    'stand', 'throne', 'pedal', 'rug', 'riser', 'chair', 'stool',
    'amp ', 'amplifier', 'cabinet', 'combo',
    'bass guitar', 'keyboard', 'piano',
    'drum throne', 'drum rug',
    // Hebrew
    'כיסא', 'עמדה', 'מגבר', 'גיטרה', 'קלידים', 'תוף', 'מצילה',
  ];

  // ── PA / venue-system exclusions (fallback scan only) ──────────────────
  const PA_SKIP = [
    'line array', 'subwoofer', 'front of house', ' FOH', 'PA system',
    'delay tower', 'infill', 'sidefill', 'front fill', 'main system',
    'mixing console', 'digital console', 'soundcraft', 'digico', 'avid',
    'IEM transmitter', 'wireless system', 'Shure PSM', 'Sennheiser IEM',
    'distribution', 'splitter', 'intercom',
  ];

  const seen    = new Set();
  const results = [];
  const push = (raw) => {
    const clean = raw.trim().replace(/\s+/g, ' ');
    const key   = clean.toLowerCase();
    if (clean.length < 3 || seen.has(key)) return;
    seen.add(key);
    results.push(clean);
  };

  // ── Shared line pre-checks ──────────────────────────────────────────────
  const shouldSkip = (line) => {
    if (line.length < 3 || line.length > 160) return true;
    if (isInputListRow(line)) return true;
    // All-caps section headers with no digits (e.g. "BACKLINE", "RISERS:")
    if (line === line.toUpperCase() && !/\d/.test(line) && line.length < 60) return true;
    // Sub-header single words / short lines with no digits ("Keyboard", "Drums", "Chairs:")
    if (line.length < 10 && !/\d/.test(line)) return true;
    // Short label-with-colon ("Chairs:", "Istanbul :", "Keyboard  :")
    if (/:\s*$/.test(line) && line.length < 30) return true;
    return false;
  };

  // ── Pass 1: BACKLINE section ────────────────────────────────────────────
  const sectionLines = backlineStart >= 0
    ? lines.slice(backlineStart, inputListStart)
    : [];

  for (const line of sectionLines) {
    if (shouldSkip(line)) continue;

    // Quantity with "x": "4 x Keyboard stand", "1x drum throne", "2x Guitar amp"
    if (/^\d+\s*[×xX]\s*.{3,}/i.test(line)) { push(line); continue; }

    // Quantity without "x": "2 risers required", "1 stool chair for the singer"
    const qtyN = line.match(/^(\d+)\s+([A-Za-z].{3,})/);
    if (qtyN) { push(line); continue; }

    // Bullet / symbol prefix
    const bullet = line.match(/^[●•·*–\-]\s*(.{3,})/);
    if (bullet) {
      const content = bullet[1];
      // Skip drum-dimension specs: e.g. '22" Bass Drum', '14"x 5" Ludwig snare'
      // PDF typically uses Unicode curly quotes for inch marks (U+201C/201D/2033)
      if (/^\d+["“”″]/.test(content)) continue;
      push(content);
      continue;
    }

    // Keyword match — require length >= 10 to avoid bare sub-header words
    if (line.length >= 10) {
      const lower = line.toLowerCase();
      if (BACKLINE_KW.some((kw) => lower.includes(kw))) { push(line); continue; }
    }
  }

  // ── Pass 2: full-text fallback (BACKLINE section not found / too empty) ──
  if (results.length < 3) {
    for (const line of lines) {
      if (results.length >= 50) break;
      if (shouldSkip(line)) continue;
      if (/^(page\s*\d+|\d{1,3}$|tel[\s:]+|email[\s:]+)/i.test(line)) continue;

      const lower = line.toLowerCase();
      if (PA_SKIP.some((t) => lower.includes(t.toLowerCase()))) continue;

      // Strict qty+x in fallback
      if (/^\d+\s*[×xX]\s*.{3,}/i.test(line)) { push(line); continue; }

      const bullet = line.match(/^[●•·*–\-]\s*(.{3,})/);
      if (bullet) {
        const content = bullet[1];
        if (/^\d+["""″]/.test(content)) continue;
        push(content);
        continue;
      }

      if (line.length >= 10) {
        if (BACKLINE_KW.some((kw) => lower.includes(kw))) { push(line); }
      }
    }
  }

  return results.slice(0, 60);
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

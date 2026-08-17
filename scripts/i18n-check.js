#!/usr/bin/env node
//
// i18n-check — reports interface strings that are not translated yet.
//
// Run manually, no dependencies, not a test runner:
//
//   node scripts/i18n-check.js
//   node scripts/i18n-check.js --en client/src/i18n/en.js --he client/src/i18n/he.js
//   node scripts/i18n-check.js --src /tmp/main/client/src
//
// Reports three things and exits 1 if any of them is non-empty:
//
//   1. Missing Hebrew keys   — in en, absent from he
//   2. Orphaned Hebrew keys  — in he, absent from en (usually a rename that
//                              left the old entry behind)
//   3. Untranslated literals — user-facing strings in client/src/**/*.jsx that
//                              are not inside a t() call, plus any hardcoded
//                              Hebrew literal
//
// Suppress a genuine false positive with a line comment:
//
//   <span>OK</span>   // i18n-ignore
//
// The literal scan is a regex heuristic, not a parser. It is tuned to stay
// quiet rather than complete: it would rather miss a string than cry wolf on
// every className. Anything it flags should be a real decision.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? path.resolve(ROOT, process.argv[i + 1]) : fallback;
}
const SRC_DIR = arg('--src', path.join(ROOT, 'client', 'src'));
const EN_PATH = arg('--en', path.join(SRC_DIR, 'i18n', 'en.js'));
const HE_PATH = arg('--he', path.join(SRC_DIR, 'i18n', 'he.js'));

// ── Key loading ──────────────────────────────────────────────────────────────
// Accepts `export default {…}`, `export const en = {…}`, or a CJS export.
// Nested objects flatten to dotted keys so `nav.shows` compares cleanly.

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.add(key);
  }
  return out;
}

async function loadKeys(file) {
  if (!fs.existsSync(file)) return null;
  const mod = await import('file://' + file);
  const dict = mod.default || mod.en || mod.he || mod.strings || mod;
  if (!dict || typeof dict !== 'object') return null;
  return flatten(dict);
}

// ── Literal scan ─────────────────────────────────────────────────────────────

const HEBREW = /[\u0590-\u05FF]/;

// Attributes whose value a user reads.
const USER_FACING_ATTRS =
  /\b(placeholder|title|aria-label|alt|label|aria-placeholder|aria-description)\s*=\s*"([^"]+)"/g;

// Keys in config objects and default props that hold display copy. This is the
// second pass — it catches strings that never appear between JSX tags, e.g.
//   const COLUMNS = [{ key: 'name', label: 'Full name' }]
//   function Empty({ message = 'Nothing here yet' })
const COPY_KEYS =
  /\b(label|title|text|heading|subtitle|description|message|placeholder|caption|tooltip|cta|empty|emptyText|confirmText|helper|hint|sublabel|name)\s*:\s*'([^'\\]{2,})'/g;
const DEFAULT_PROP =
  /\b(label|title|text|heading|message|placeholder|caption|tooltip|empty|confirmText|helper|hint)\s*=\s*'([^'\\]{2,})'/g;

const USER_MESSAGE_CALL =
  /\b((?:set[A-Za-z0-9_]*(?:Toast|Message|Msg|Error)|toast(?:\.[A-Za-z0-9_]+)?|(?:window\.)?(?:alert|confirm|prompt)))\s*\(([^;\n]*)\)/g;

// Attribute values written as a braced literal rather than a plain string:
//   placeholder={'שם מוזמן'}   placeholder={`שם מוזמן`}
const BRACED_ATTR =
  /\b(placeholder|title|label|alt|aria-label|text|message)\s*=\s*\{\s*[`']([^`']{2,})[`']\s*\}/g;

// Text sitting directly between JSX tags: >Some words<
const JSX_TEXT = />([^<>{}\n]{2,})</g;

// Any quoted literal at all — used only by the Hebrew pass below.
const ANY_LITERAL = /(['"`])((?:(?!\1)[^\\\n])*)\1/g;

// Lines that match a stored value against a literal rather than displaying it:
//   if (k.includes('בקלי')) …
// The Hebrew there is data-matching, not copy. Skipping the whole line is a
// deliberate over-skip: it is predictable, and a display string almost never
// shares a line with one of these calls.
const MATCHING_CALL = /\.(includes|startsWith|endsWith|indexOf|match|test|replace|split)\s*\(|new Set\s*\(/;

// `show.eventType === 'אני גיטרה'` compares against stored data. The literal is
// a value in the database, not copy — translating it would break the match.
const isComparisonOperand = (line, i) => /(?:===|!==|==|!=)\s*$/.test(line.slice(0, i));

// `'בקליין': 'Backline'` — a Hebrew object KEY is a lookup entry for legacy
// stored values, never displayed. A trailing ":" alone is not enough to prove
// that: `val ? '✓ כן' : '✕ לא'` has one too, and both halves of that ternary
// are copy. A real key also opens its position — line start, "{" or ",".
const isObjectKey = (line, startIndex, endIndex) =>
  /^\s*:/.test(line.slice(endIndex)) && /(^\s*|[{,]\s*)$/.test(line.slice(0, startIndex));

function isDomainEntityName(line, startIndex, endIndex) {
  const objectStart = line.lastIndexOf('{', startIndex);
  const objectEnd = line.indexOf('}', endIndex);
  if (objectStart === -1 || objectEnd === -1) return false;
  const record = line.slice(objectStart, objectEnd + 1);
  return /\bid\s*:\s*['"`][a-z0-9_-]+['"`]/.test(record)
    && /\bcolor\s*:\s*['"`]#[0-9a-f]{3,8}['"`]/i.test(record);
}

const hasJsxClosingBoundary = (line, match) =>
  /[A-Za-z/]/.test(line[match.index + match[0].length] || '');

function isTechnicalCodeText(line, match) {
  const before = line.slice(0, match.index + 1);
  const opening = before.match(/<([A-Za-z][\w.-]*)\b[^>]*>$/);
  if (!opening) return false;
  if (/^(code|kbd|samp|pre)$/i.test(opening[1])) return true;
  return /\bclassName\s*=\s*['"][^'"]*\bltr\b[^'"]*['"]/.test(opening[0])
    && /^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(match[1].trim());
}

const LOOKS_LIKE_I18N_KEY = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/;

// ── Exclusions ───────────────────────────────────────────────────────────────

// A class list: lowercase/kebab tokens only. Also catches most CSS values.
const LOOKS_LIKE_CLASSES = /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\s+[a-z0-9]+(?:[-_][a-z0-9]+)*)*$/;

// Fragments of JS that land between tags when a component is written across
// lines — operators, closing calls, ternary tails. Never prose.
const LOOKS_LIKE_CODE =
  /^[\s{}()[\];:,.?&|!=<>+*/%-]*$|=>|\)\s*$|^\s*\.\.\.|^(true|false|null|undefined)$/;

const NOT_PROSE = [
  /^\s*$/,                       // whitespace
  /^[\d\s.,:/–—-]+$/,            // pure numbers, dates, ranges
  /^#[0-9a-fA-F]{3,8}$/,         // hex colours
  /^\d+(px|rem|em|%|vh|vw|s|ms)$/, // css values
  /^https?:\/\//,                // urls
  /^[/.]{1,2}\//,                // paths
  /^[A-Za-z-]+\/[A-Za-z0-9.+-]+$/, // mime types
  /^[\u2190-\u21FF\u2200-\u22FF\u2700-\u27BF✓✕✔✖·•⚠→←↑↓‹›▾▴⠿]+$/, // glyphs only
  /^&[a-z]+;$/,                  // html entities
];

// Attribute names whose values are never read by a user.
const CODE_ATTR = /\b(className|class|key|id|name|type|role|dir|lang|href|src|to|htmlFor|method|action|accept|autoComplete|inputMode|data-[\w-]+|aria-hidden|aria-controls|aria-labelledby|viewBox|d|fill|stroke|xmlns|style)\s*=\s*"/;

function isProse(s) {
  const v = s.trim();
  if (v.length < 2) return false;
  if (NOT_PROSE.some((re) => re.test(v))) return false;
  if (!/[A-Za-z\u0590-\u05FF]/.test(v)) return false;   // must contain a letter
  if (LOOKS_LIKE_CODE.test(v)) return false;
  if (HEBREW.test(v)) return true;                       // any Hebrew is a hit
  if (LOOKS_LIKE_CLASSES.test(v)) return false;          // css-ish, lowercase only
  // English prose: a capital letter, or more than one word.
  return /[A-Z]/.test(v) || /\s/.test(v);
}

// Is this offset inside a t(...) call on the line?
function insideT(line, index) {
  const before = line.slice(0, index);
  const opens = (before.match(/\bt\(/g) || []).length;
  if (!opens) return false;
  const lastT = before.lastIndexOf('t(');
  const after = before.slice(lastT);
  // still open if unbalanced parens since the last t(
  return (after.match(/\(/g) || []).length > (after.match(/\)/g) || []).length;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsx')) out.push(p);
  }
  return out;
}

function scanSource(source) {
  const hits = [];
  const lines = source.split('\n');

  // Block-comment state has to be tracked across lines: a continuation line of
  // a {/* … */} comment starts with ordinary prose, so per-line tests miss it.
  let inBlock = false;

  lines.forEach((line, i) => {
    const opens = line.includes('/*');
    const closes = line.includes('*/');
    const wasInBlock = inBlock;
    if (opens && !closes) inBlock = true;
    else if (closes) inBlock = false;
    if (wasInBlock || (opens && !closes)) return;

    if (line.includes('i18n-ignore')) return;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (/^import\s|^export\s+\*|require\(/.test(trimmed)) return;
    if (/console\.(log|warn|error|info)/.test(line)) return;

    const seen = new Set();
    const push = (value, index, kind) => {
      const v = value.trim();
      if (!v || seen.has(v)) return;
      if (!isProse(v)) return;
      if (insideT(line, index)) return;
      seen.add(v);
      hits.push({ line: i + 1, value: v, kind, hebrew: HEBREW.test(v) });
    };

    for (const re of [USER_FACING_ATTRS, DEFAULT_PROP, BRACED_ATTR]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) push(m[2], m.index, 'attr/config');
    }

    USER_MESSAGE_CALL.lastIndex = 0;
    let messageMatch;
    while ((messageMatch = USER_MESSAGE_CALL.exec(line))) {
      ANY_LITERAL.lastIndex = 0;
      let literalMatch;
      while ((literalMatch = ANY_LITERAL.exec(messageMatch[2]))) {
        if (LOOKS_LIKE_I18N_KEY.test(literalMatch[2])) continue;
        if (literalMatch[1] === '`'
            && !isProse(literalMatch[2].replace(/\$\{[^}]*\}/g, ''))) continue;
        const argsOffset = messageMatch[0].indexOf(messageMatch[2]);
        push(literalMatch[2], messageMatch.index + argsOffset + literalMatch.index, 'user-message');
      }
    }

    COPY_KEYS.lastIndex = 0;
    let copyMatch;
    while ((copyMatch = COPY_KEYS.exec(line))) {
      if (copyMatch[1] === 'name'
          && isDomainEntityName(line, copyMatch.index, copyMatch.index + copyMatch[0].length)) continue;
      push(copyMatch[2], copyMatch.index, 'attr/config');
    }

    // Hebrew pass. Any Hebrew literal anywhere is a hit regardless of where it
    // sits, because in this codebase Hebrew in source is always either copy
    // that escaped extraction or a value being matched — and the matching case
    // is filtered out above.
    if (!MATCHING_CALL.test(line)) {
      ANY_LITERAL.lastIndex = 0;
      let m;
      while ((m = ANY_LITERAL.exec(line))) {
        if (!HEBREW.test(m[2])) continue;
        if (isComparisonOperand(line, m.index)) continue;
        if (isObjectKey(line, m.index, m.index + m[0].length)) continue;
        push(m[2], m.index, 'hebrew-literal');
      }
    }

    JSX_TEXT.lastIndex = 0;
    let m;
    while ((m = JSX_TEXT.exec(line))) {
      if (!hasJsxClosingBoundary(line, m)) continue;
      if (isTechnicalCodeText(line, m)) continue;
      // Skip when the ">" closes a tag carrying a code-only attribute on the
      // same line and the capture is really the tail of that markup.
      if (CODE_ATTR.test(line) && LOOKS_LIKE_CLASSES.test(m[1].trim())) continue;
      push(m[1], m.index, 'jsx-text');
    }
  });

  return hits;
}

function scanFile(file) {
  return scanSource(fs.readFileSync(file, 'utf8'));
}

// ── Report ───────────────────────────────────────────────────────────────────

const rel = (p) => path.relative(ROOT, p);

function section(title, lines) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  if (!lines.length) { console.log('  none'); return; }
  lines.forEach((l) => console.log('  ' + l));
}

async function main() {
  const enKeys = await loadKeys(EN_PATH);
  const heKeys = await loadKeys(HE_PATH);

  const missing  = [];
  const orphaned = [];
  let dictsLoaded = true;

  if (!enKeys || !heKeys) {
    dictsLoaded = false;
  } else {
    for (const k of enKeys) if (!heKeys.has(k)) missing.push(k);
    for (const k of heKeys) if (!enKeys.has(k)) orphaned.push(k);
  }

  const byFile = [];
  let literalCount = 0, hebrewCount = 0;
  for (const f of walk(SRC_DIR)) {
    const hits = scanFile(f);
    if (!hits.length) continue;
    byFile.push([f, hits]);
    literalCount += hits.length;
    hebrewCount  += hits.filter((h) => h.hebrew).length;
  }
  byFile.sort((a, b) => b[1].length - a[1].length);

  console.log('i18n-check');
  console.log('==========');
  if (!dictsLoaded) {
    console.log(`  dictionaries      NOT FOUND`);
    console.log(`                    expected ${rel(EN_PATH)}`);
    console.log(`                    and      ${rel(HE_PATH)}`);
  } else {
    console.log(`  en keys           ${enKeys.size}`);
    console.log(`  he keys           ${heKeys.size}`);
    console.log(`  missing hebrew    ${missing.length}`);
    console.log(`  orphaned hebrew   ${orphaned.length}`);
  }
  console.log(`  untranslated      ${literalCount}   (in ${byFile.length} files)`);
  console.log(`    of which hebrew ${hebrewCount}`);

  if (dictsLoaded) {
    section('Missing Hebrew keys', missing);
    section('Orphaned Hebrew keys', orphaned);
  }

  console.log('\nUntranslated literals');
  console.log('---------------------');
  if (!byFile.length) console.log('  none');
  for (const [f, hits] of byFile) {
    console.log(`\n  ${rel(f)}  (${hits.length})`);
    for (const h of hits) {
      const tag = h.hebrew ? 'HE ' : '   ';
      const v = h.value.length > 68 ? h.value.slice(0, 65) + '…' : h.value;
      console.log(`    ${tag}${String(h.line).padStart(4)}  ${v}`);
    }
  }

  const failed = !dictsLoaded || missing.length || orphaned.length || literalCount;
  console.log(failed ? '\nFAIL' : '\nOK');
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();

module.exports = { isProse, scanSource };

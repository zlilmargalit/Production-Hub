// ── Interface language ───────────────────────────────────────────────────────
//
// Interface strings are translated; content is not. A show keeps the name the
// user typed in both language modes. Anything that came out of the database
// renders as stored — see the i18n rule in CLAUDE.md.
//
// Two functions, deliberately:
//
//   t(key)        → always a string. Safe for placeholder / title / aria-label
//                   / alert / document.title, none of which can take elements.
//   tx(key, vars) → React elements. Each interpolated value gets its own
//                   <span dir="auto">, so a Hebrew show name inside an English
//                   sentence (or the reverse) settles on its own direction
//                   instead of dragging the sentence around it.
//
// Never build a display string with a template literal. `${count} shows` is one
// run with a neutral-led number in front of Latin text; under RTL the bidi
// algorithm is free to move the number to the far end.

import { createContext, useContext, useMemo } from 'react';
import en from './en';
import he from './he';
import { applyDirection } from '../utils/direction';

const DICTS = { en, he };
export const LANGS = ['en', 'he'];
export const DIR_FOR_LANG = { en: 'ltr', he: 'rtl' };

// Cached so the very first paint after a reload is already in the right
// language. The server record is the source of truth and reconciles on load;
// this only avoids a flash of English before /api/me answers.
const LANG_KEY = 'ph-lang';

export function readStoredLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return LANGS.includes(v) ? v : 'en';
  } catch {
    return 'en';
  }
}

export function storeLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode */ }
}

const PLACEHOLDER = /\{(\w+)\}/g;

function lookup(lang, key) {
  const dict = DICTS[lang] || en;
  if (key in dict) return dict[key];
  // Fall back to English rather than showing the raw key: a missing Hebrew
  // string should degrade to a readable interface, not to `nav.shows`.
  if (key in en) {
    return import.meta.env.DEV ? '⚠ ' + en[key] : en[key];
  }
  return import.meta.env.DEV ? '⚠ ' + key : key;
}

export function makeT(lang) {
  // Plain string. No interpolation by design — a caller that needs a value
  // embedded in a sentence needs tx, which can isolate it.
  const t = (key) => lookup(lang, key);

  // React fragment. Splits on {name} and wraps each substituted value in its
  // own bidi isolate.
  const tx = (key, vars = {}) => {
    const raw = lookup(lang, key);
    const out = [];
    let last = 0;
    let m;
    PLACEHOLDER.lastIndex = 0;
    while ((m = PLACEHOLDER.exec(raw))) {
      if (m.index > last) out.push(raw.slice(last, m.index));
      const value = vars[m[1]];
      out.push(
        <span key={`${m[1]}-${m.index}`} dir="auto">
          {value === undefined ? m[0] : value}
        </span>
      );
      last = m.index + m[0].length;
    }
    if (last < raw.length) out.push(raw.slice(last));
    return <>{out.map((part, i) => <span key={i}>{part}</span>)}</>;
  };

  return { t, tx };
}

const I18nContext = createContext(null);

export function I18nProvider({ lang = 'en', children }) {
  const value = useMemo(() => {
    const { t, tx } = makeT(lang);
    return { t, tx, lang, dir: DIR_FOR_LANG[lang] || 'ltr' };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  // Falling back instead of throwing keeps a component usable in isolation
  // (a test harness, a screen mounted outside the provider during a refactor).
  if (!ctx) {
    const { t, tx } = makeT('en');
    return { t, tx, lang: 'en', dir: 'ltr' };
  }
  return ctx;
}

// ── Switching ────────────────────────────────────────────────────────────────
// Persist first, then reload. Swapping `dir` on a live tree causes layout
// thrash and a class of focus/scroll bugs that a reload simply does not have;
// the product already reloads on workspace switch, so this matches.
export async function switchLanguage(lang) {
  if (!LANGS.includes(lang)) return;
  const res = await fetch('/api/me', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang }),
  });
  if (!res.ok) throw new Error('Could not save the language preference');
  storeLang(lang);
  applyDirection(DIR_FOR_LANG[lang]);
  window.scrollTo(0, 0);
  window.location.reload();
}

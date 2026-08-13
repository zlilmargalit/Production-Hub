// Writes the document's direction and language.
//
// Called at module scope in main.jsx, before ReactDOM renders — a useEffect
// would run after first paint and produce a flash of the wrong direction.
//
// The stage-1 dev-only source (a ?dir= URL parameter and a `ph-dir` localStorage
// key) has been removed. The direction now follows the interface language: see
// `switchLanguage` and `readStoredLang` in ../i18n.

// `lang` matters as much as `dir`: it selects locale-correct font fallback and
// hyphenation, and it is what assistive tech announces.
const LANG_FOR_DIR = { rtl: 'he', ltr: 'en' };

export function applyDirection(dir = 'ltr') {
  const value = dir === 'rtl' ? 'rtl' : 'ltr';
  const el = document.documentElement;
  el.dir  = value;
  el.lang = LANG_FOR_DIR[value];
  return value;
}

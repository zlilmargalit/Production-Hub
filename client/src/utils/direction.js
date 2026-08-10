// ── TEMPORARY: stage-1 direction switch ──────────────────────────────────────
//
// Stage 1 makes the layout RTL-capable while all interface text is still
// English. There is no user-facing language preference yet, so the direction
// comes from a dev-only source:
//
//   ?dir=rtl  in the URL   → sets the direction AND remembers it
//   ?dir=ltr  in the URL   → resets back to the default
//   localStorage['ph-dir'] → whatever was last set that way
//
// STAGE 2 REPLACES ALL OF THIS with the real per-user preference. When that
// lands, delete this file and drive `applyDirection` from the user record.
// Nothing outside `main.jsx` should import it.
//
// Applied at module scope, before ReactDOM renders — a useEffect would run
// after first paint and produce exactly the LTR flash this avoids.

const STORAGE_KEY = 'ph-dir';

// `lang` matters as much as `dir`: it selects locale-correct font fallback and
// hyphenation, and it is what assistive tech announces.
const LANG_FOR_DIR = { rtl: 'he', ltr: 'en' };

export function resolveDirection() {
  let dir = null;

  try {
    const param = new URLSearchParams(window.location.search).get('dir');
    if (param === 'rtl' || param === 'ltr') {
      dir = param;
      localStorage.setItem(STORAGE_KEY, dir);
    }
  } catch { /* malformed URL — fall through to storage */ }

  if (!dir) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'rtl' || stored === 'ltr') dir = stored;
    } catch { /* storage unavailable (private mode) — fall through */ }
  }

  return dir || 'ltr';
}

export function applyDirection(dir = resolveDirection()) {
  const el = document.documentElement;
  el.dir  = dir;
  el.lang = LANG_FOR_DIR[dir] || 'en';
  return dir;
}

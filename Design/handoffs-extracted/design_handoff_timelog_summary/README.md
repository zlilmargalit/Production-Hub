# Handoff: Time Log — Summary Redesign (Option B · "Zero Band")

## Goal
The Time Log page currently opens with a **band of three tall metric cards**
(Total Unbilled / Assaf · This Month / Hila · This Month). It wastes ~150px of
vertical space, and two of the three cards **duplicate the artist filter pills**
directly beneath them.

**Option B removes the card band entirely.** The two genuinely useful numbers move
into the page-title meta area, and each artist's monthly hours are **folded into the
filter pills** — so the data sits exactly where you click to act on it. Net result:
the band's ~150px collapses to **0px**, zero duplication, denser page.

> Reference render: `option-b-after.png` (in this folder).

---

## About these files
The files here are a **design reference built in React/HTML** — they show the
intended look & behavior, they are **not** drop-in production code. Recreate this
inside the real Production Hub `Time Log` page, reusing its existing CSS variables
and components. Every value you need is specified below.

**Fidelity:** High — exact sizes, fonts, spacing, colors, and shapes given.

---

## Target file
- `src/.../Time Log.jsx` (the uploaded reference is `Time Log.html`). Relevant
  regions in the reference:
  - **Page title row** — the `<h1>Time Log.</h1>` + "sessions logged / June 2026" meta.
  - **Metric band** — the `<div>` with `gridTemplateColumns:'repeat(3,1fr)'` rendering three `<MetricBox>`.
  - **Filter pills** — the row of `<Pill>` components.

Two edits: **(1) delete the metric band**, **(2) rebuild the title-meta and the pills.**

---

## Design tokens (already defined in `:root` — do not invent new ones)
| Token | Value | Role here |
|---|---|---|
| `--bg` | `#F1EEE9` | page background |
| `--surface` | `#FBF8F2` | active-pill text color (on dark) |
| `--sunk` | `#EBE7E0` | hour-chip background (idle pill) |
| `--border` | `#DDD7CE` | idle pill border, vertical divider |
| `--border-strong` | `#C8C1B5` | pill hover border |
| `--ink` | `#1A1714` | primary text, active pill bg, "Logged" number |
| `--ink-2` | `#6B6259` | idle pill text |
| `--ink-3` | `#A39A91` | eyebrows, units, divider, "sessions" word |
| `--blue` | `#3852B4` | Unbilled accent number + eyebrow, Assaf dot |
| `--orange` | `#F08D39` | Hila dot |

**Fonts**
- `DISPLAY = 'Bricolage Grotesque', sans-serif` — all numbers, the H1.
- `HEB = 'Assistant', sans-serif` — all labels, eyebrows, pill text, units words.

---

## CHANGE 1 — Delete the metric band
Remove the entire three-column metric grid:

```jsx
{/* ── Metric boxes ── */}   ← DELETE this whole block
<div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20, marginTop:26 }}>
  <MetricBox num={fmtHours(unbilled)} ... />
  <MetricBox num={fmtHours(assafM)}  ... />
  <MetricBox num={fmtHours(hilaM)}   ... />
</div>
```
The `<MetricBox>` component is now unused — delete its definition too.
Keep the computed values `unbilled`, `assafM`, `hilaM` (and add `hilaM`-style
totals for `general` and a grand total — see below); they now feed the title + pills.

---

## CHANGE 2 — Title row with the two real numbers

### Shape & layout
A single flex row, `space-between`, ending in a 2px ink underline (this border
already exists on the title row — keep it).

- Container: `display:flex; align-items:flex-end; justify-content:space-between; gap:24px; padding-bottom:18px; border-bottom:2px solid var(--ink);`
- **Left:** the existing `<h1>` — add `white-space:nowrap` so it never wraps.
- **Right:** a stat group: `display:flex; align-items:center; gap:20px;`
  containing **Unbilled · June**, a vertical divider, **Logged**.

### H1
```
font-family: DISPLAY;  font-size: clamp(2.4rem, 5vw, 3.4rem);  font-weight: 800;
letter-spacing: -0.05em;  line-height: 0.9;  white-space: nowrap;
```
The trailing period is `<span style="color:var(--blue)">.</span>` (unchanged).

### Stat: "Unbilled · June" (the hero — blue)
```jsx
<div style={{ textAlign:'right' }}>
  <span style={{ fontFamily:HEB, fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.12em',
    textTransform:'uppercase', color:'var(--blue)' }}>Unbilled · June</span>
  <div style={{ display:'flex', alignItems:'baseline', gap:5, justifyContent:'flex-end', marginTop:3 }}>
    <span style={{ fontFamily:DISPLAY, fontSize:'2.2rem', fontWeight:800, lineHeight:0.9,
      letterSpacing:'-0.04em', color:'var(--blue)' }}>{fmtHours(unbilled)}</span>
    <span style={{ fontFamily:DISPLAY, fontSize:'0.85rem', fontWeight:700, color:'var(--ink-3)' }}>hrs</span>
  </div>
</div>
```

### Divider
```jsx
<span style={{ width:1, height:46, background:'var(--border)' }} />
```

### Stat: "Logged" (ink)
Same structure; eyebrow color `var(--ink-3)`, number color `var(--ink)`, and the
unit word is "sessions" in `HEB 0.74rem var(--ink-3)`:
```jsx
<div style={{ textAlign:'right' }}>
  <span style={{ fontFamily:HEB, fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.12em',
    textTransform:'uppercase', color:'var(--ink-3)' }}>Logged</span>
  <div style={{ display:'flex', alignItems:'baseline', gap:5, justifyContent:'flex-end', marginTop:3 }}>
    <span style={{ fontFamily:DISPLAY, fontSize:'2.2rem', fontWeight:800, lineHeight:0.9,
      letterSpacing:'-0.04em' }}>{entries.length}</span>
    <span style={{ fontFamily:HEB, fontSize:'0.74rem', color:'var(--ink-3)' }}>sessions</span>
  </div>
</div>
```

> The old standalone "9 · sessions logged — June 2026" meta line is now redundant
> with this — **remove it.** "June" lives in the Unbilled eyebrow; the count lives
> in "Logged".

#### Title row spec table
| Element | Font | Size | Weight | Tracking | Color |
|---|---|---|---|---|---|
| H1 "Time Log" | Bricolage | clamp 2.4–3.4rem | 800 | -0.05em | `--ink` (period `--blue`) |
| Stat eyebrow | Assistant | 0.6rem | 700 | 0.12em, uppercase | `--blue` / `--ink-3` |
| Stat number | Bricolage | 2.2rem | 800 | -0.04em | `--blue` / `--ink` |
| "hrs" unit | Bricolage | 0.85rem | 700 | — | `--ink-3` |
| "sessions" unit | Assistant | 0.74rem | 400 | — | `--ink-3` |
| Stat group gap | — | 20px | — | — | — |
| Number↕eyebrow | — | marginTop 3px | — | — | — |

---

## CHANGE 3 — Filter pills carry artist hours

The filter row is unchanged in position (`margin-top:22px`, eyebrow "Filter" +
pills). Each pill gains a trailing **hour chip** instead of the plain count.

### Pill shape (rectangular — NOT rounded; matches existing pills)
- `display:flex; align-items:center; gap:8–9px;`
- `padding: 8px 8px 8px 14px;` (tighter right pad to seat the chip)
- `border: 1px solid var(--border);` idle → `var(--ink)` when active
- `background: transparent;` idle → `var(--ink)` when active
- `color: var(--ink-2);` idle → `var(--surface)` when active
- `font: 600 0.82rem HEB;`  `white-space: nowrap;`
- **No border-radius** (the app's pills are square-cornered).

### Artist dot (leading)
`width:8px; height:8px; border-radius:50%; background:<artist color>;` —
`var(--blue)` Assaf, `var(--orange)` Hila, `var(--ink-2)` General.

### Hour chip (trailing — this is the new part)
A small **pill-shaped** (`border-radius:999px`) inset chip holding the hours:
```jsx
<span style={{ display:'inline-flex', alignItems:'baseline', gap:3, marginLeft:4,
  padding:'3px 9px', borderRadius:999,
  background: on ? 'rgba(255,255,255,0.16)' : 'var(--sunk)' }}>
  <span style={{ fontFamily:DISPLAY, fontSize:'0.84rem', fontWeight:800, letterSpacing:'-0.02em',
    color: on ? 'var(--surface)' : 'var(--ink)' }}>{fmtHours(hours)}</span>
  <span style={{ fontSize:'0.6rem', color: on ? 'rgba(255,255,255,0.7)' : 'var(--ink-3)' }}>h</span>
</span>
```

### Which value each pill shows
| Pill | Hours value | Dot |
|---|---|---|
| All artists | grand total of all sessions (e.g. 41.5) | none |
| Assaf Amdursky | `assafM` | `--blue` |
| Hila Ruach | `hilaM` | `--orange` |
| General / Agency | `generalM` (add this sum) | `--ink-2` |

> Compute `generalM` and the grand total the same way `assafM`/`hilaM` are computed.
> Show **hours** in the chip (the design's intent). If you want to keep counts too,
> the count can stay as a tiny superscript — but the recommended version is
> hours-only to stay clean.

### Pill states
- **Hover (idle):** border → `var(--border-strong)`.
- **Active:** bg `var(--ink)`, text `var(--surface)`, chip bg `rgba(255,255,255,0.16)`, chip text `var(--surface)`. Active hover keeps `border:var(--ink)`.
- Transition: `border-color .14s, color .14s`.

#### Pill spec table
| Element | Font | Size | Weight | Color (idle / active) |
|---|---|---|---|---|
| Label | Assistant | 0.82rem | 600 | `--ink-2` / `--surface` |
| Dot | — | 8×8 circle | — | artist color |
| Chip number | Bricolage | 0.84rem | 800 | `--ink` / `--surface` |
| Chip "h" | Assistant | 0.6rem | 400 | `--ink-3` / `rgba(255,255,255,.7)` |
| Chip bg | — | radius 999, pad 3×9 | — | `--sunk` / `rgba(255,255,255,.16)` |
| Pill padding | — | 8 8 8 14 | — | — |
| Pill gap | — | 8–9px | — | — |

---

## Spacing summary (vertical rhythm)
| Gap | Value |
|---|---|
| Title row padding-bottom | 18px (above the 2px ink underline) |
| Underline → Filter row | 22px (`margin-top`) |
| ~~Metric band~~ | **removed (was ~150px + 24px margins)** |
| Filter row → Sessions action bar | keep existing (28px) |

---

## Behavior (unchanged logic, new placement)
- Clicking a pill filters the session grid exactly as today (`setFilter(id)`).
- The hero "Unbilled" number reacts to billed-toggles in the grid (it already
  recomputes from `entries.filter(e=>!e.billed)`).
- "Logged" = `entries.length`; pill hours = per-artist sums of `e.hours`.
- Empty state: when a month has 0 sessions every number reads `0.0` / `0` (as in
  the live screenshot the user shared) — the layout still holds, just compact.

## Responsive
- Title `<h1>` uses `clamp()` so it shrinks on narrow widths; keep `white-space:nowrap`.
- Below ~720px, let the right-hand stat group wrap **under** the H1 (`flex-wrap:wrap`
  on the title row) and let the pills wrap (`flex-wrap:wrap`, already the case).

## Assets in this folder
- `option-b-after.png` — the redesigned header strip (primary reference).
- `option-b-full.png` — full-width render with breathing room.
- `option-b-render.html` — the exact, isolated React render of Option B (open it,
  inspect computed styles to confirm any value).
- `../Time Log Summary Redesign.html` — the comparison canvas (Current / A / B).

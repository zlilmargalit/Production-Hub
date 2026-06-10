# Handoff: Home / "Today" Page — Pixel-Exact Correction Spec

## Read this first
The deployed build does **not** match the reference design (`Home Optimized.html`). This document fixes **every** deviation, item by item. Treat `Home Optimized.html` as the single source of truth — open it side-by-side with the live app. Every value below is taken directly from it.

**Two global rules that fix half the problems:**
1. **Borders inside cards are LIGHT hairlines** (`--border #DDD7CE`), **never ink/black** (`--text #1A1714`). Ink is used ONLY for: the outer 1px frame of a card, the 2px divider under the page header, and filled/active states.
2. **Card shadow is a FLAT offset, no blur, in a near-white warm gray** — `box-shadow: 4px 4px 0 var(--surface-sunk)` where `--surface-sunk = #EBE7E0`. It must **not** be a soft/blurred/dark shadow (`0 4px 20px rgba(0,0,0,.x)` is wrong).

---

## ✅ CRITICAL FIXES (the 5 reported issues)

### Fix 1 — "All the frames have an (ugly) shadow"
**Symptom:** Calendar / Up Next / Tasks cards show a heavy, soft, dark drop shadow.
**Cause:** A blurred Material-style shadow (e.g. `box-shadow: 0 4px 20px rgba(0,0,0,.12)`) instead of the design's flat offset block.
**Exact fix — every card uses exactly this and nothing else:**
```css
.mcal, .upnext, .mytasks-card {
  border: 1px solid var(--text);        /* #1A1714 — the only ink border on the card */
  background: var(--surface);           /* #FBF8F2 */
  box-shadow: 4px 4px 0 var(--surface-sunk);  /* #EBE7E0, ZERO blur, ZERO spread */
  border-radius: 0;                     /* square — no rounding anywhere */
}
```
There is no second shadow layer, no blur radius, no transparency. If it looks soft, it's wrong.

### Fix 2 — "Task checkboxes are ugly"
**Symptom:** Native/oversized checkboxes, rounded, blue, or misaligned.
**Cause:** Using `<input type="checkbox">` default styling, or wrong size/border.
**Exact fix — a bordered square box, hairline, NO native input:**
```css
.mytask-check {
  width: 16px; height: 16px;           /* exactly 16 — not 18/20/24 */
  border: 1.5px solid var(--border-strong);  /* #C8C1B5 */
  background: transparent;
  border-radius: 0;                    /* square, never rounded */
  flex-shrink: 0;
  padding: 0; appearance: none; -webkit-appearance: none;  /* kill native */
  cursor: pointer;
}
/* checked state (if a task is done) */
.mytask-check--done {
  background: var(--accent);           /* #3852B4 */
  border-color: var(--accent);
}
/* white check glyph only when done — 11×9 inline SVG, stroke #fff width 1.8 */
```
Open tasks render an **empty** 16px square with a 1.5px warm-gray border. Nothing else. The box sits at the **start of the row** (RTL: visually on the right), vertically centered.

### Fix 3 — "The moving (marquee) row doesn't look the same"
**Symptom:** Marquee too large / too dark / wrong speed / wrong position.
**Cause:** Wrong font size, opacity, bullet color, or it's placed as its own block instead of a quiet eyebrow line.
**Exact spec:**
```css
.home-marquee { height: 18px; overflow: hidden; margin-top: 11px;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent); }
.home-marquee-track { display: inline-flex; align-items: center; gap: 14px;
  white-space: nowrap; animation: hm 70s linear infinite; opacity: 0.55; }
@keyframes hm { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .home-marquee-track { animation: none; } }
```
Each item: text **"Production Hub"**, font **Bricolage Grotesque**, **0.72rem**, weight **700**, letter-spacing **0.12em**, **UPPERCASE**, color `--text-3 (#A39A91)`. After each word a bullet `•` with `margin: 0 7px`, colored `--orange (#F08D39)`. Duplicate the word list twice so the −50% loop is seamless. Speed = **70s** (slow, subtle). It is a thin eyebrow line directly under the title/stat row — **not** a big banner.

### Fix 4 — "Calendar line between header and days is BLACK, should be LIGHT"
**Symptom:** Dark/black rule under "June 2026 … MONTH/WEEK".
**Cause:** `border-bottom` uses `--text` (ink) instead of `--border` (hairline).
**Exact fix:**
```css
.mcal-topbar  { border-bottom: 1px solid var(--border); }  /* #DDD7CE — LIGHT */
.mcal-day-hdr { border-bottom: 1px solid var(--border); }  /* weekday row also LIGHT */
```
The **only** ink line on the page is the **2px** divider under the page header that the artist filter sits on (`border-top: 2px solid var(--text)`). Every line **inside** the calendar — top bar, weekday header, all cell grid lines — is `1px solid var(--border)` (light).

### Fix 5 — "Up Next is not the same height as the calendar"
**Symptom:** Up Next ends short of (or overshoots) the calendar; they don't align.
**Cause:** The two columns aren't stretched, or Up Next has a fixed height, or the calendar is being forced extra-tall.
**Exact fix — equal-height columns, Up Next fills and scrolls internally:**
```css
.dash-body {
  display: grid;
  grid-template-columns: 1.55fr 1fr;   /* calendar : up-next */
  gap: 18px;
  align-items: stretch;                /* << makes both columns equal height */
}
.upnext {
  height: 100%;                        /* fill the stretched row */
  display: flex; flex-direction: column;
  min-height: 0; overflow: hidden;
}
.upnext-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }  /* extra rows scroll, card stays calendar-height */
```
And crucially — **do not stretch the calendar's cells to fill vertical space.** The calendar height is defined purely by its rows at `min-height: 50px` (see below). Up Next then matches that height via `stretch`. If the calendar cells are tall (the current bug), the whole thing balloons and Up Next can't keep up.

---

## FULL COMPONENT SPEC (go through every one)

### Page body container
Centered, **`max-width: 1120px`**, horizontal padding ~`22px`, sits under the existing global app header. Background `--bg #F1EEE9`.

### A. Header block (title + stats + marquee + filter)
`margin-bottom: 16px`. Three parts stacked:

**A1. Title + Stat row** — `display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap;`
- **Title group** (`display:flex; align-items:baseline; gap:14px;`):
  - `<h1>` **"Today"** + `<span>` period colored `--blue`. Bricolage Grotesque, `font-size: clamp(2rem, 3.2vw, 2.55rem)`, weight **800**, letter-spacing **−0.045em**, line-height **0.95**. (The current build's ~6rem title is wrong.)
  - Date **"Sunday, 7 June 2026"** — `0.7rem`, weight 600, letter-spacing 0.04em, `--text-3`, `white-space:nowrap`. Sits **inline to the right of the title**, baseline-aligned — not on a line below.
- **Stat strip** — `display:flex; border:1px solid var(--border-strong); background:var(--surface);` (flat, no shadow). Three cells `02 ARTISTS · 10 SHOWS · 12 TASKS`:
  - Cell: `padding:7px 18px; display:flex; align-items:baseline; gap:8px;`
  - Cells 2 & 3: `border-left:1px solid var(--border);`. **Cell 1 only:** `background: var(--accent-soft) (#E8ECF7);`
  - Number: Bricolage `1.45rem`/800, letter-spacing −0.03em, `font-variant-numeric:tabular-nums`. Cell 1's number = `--blue`; others = `--text`.
  - Label: `0.7rem`/600, letter-spacing 0.05em, UPPERCASE, `--text-3`.

**A2. Marquee eyebrow** — see Fix 3.

**A3. Artist filter** — `margin-top:14px; padding-top:12px; border-top:2px solid var(--text); display:flex; align-items:center; gap:10px; flex-wrap:wrap;` (this 2px ink line is the ONE intentional dark rule).
- Label **"ARTISTS"** — `0.6rem`/700, letter-spacing 0.1em, UPPERCASE, `--text-3`, `margin-right:2px`.
- Chips: `display:flex; align-items:center; gap:7px; padding:5px 12px; font-size:0.76rem; font-weight:600; border-radius:0;`
  - **Active** ("All artists"): `border:1px solid var(--text); background:var(--text); color:var(--surface);` no dot.
  - **Inactive**: `border:1px solid var(--border); background:transparent; color:var(--text-2);` with a **7px** round dot — Assaf `--blue`, Hila `--orange` — and trailing count `0.66rem`, tabular-nums, `--text-3`.

### B. Body grid — see Fix 5 for the grid itself.

#### B1. Calendar (`.mcal`)
- Shell: Fix 1 (`1px ink border`, `--surface` bg, flat `4px 4px 0 sunk` shadow).
- **Top bar:** `padding:12px 16px;` + Fix 4 light bottom border. Space-between:
  - Left: **"June"** Bricolage `1.25rem`/800, ls −0.03em; **"2026"** `0.78rem`, `--text-3`; `gap:8px`, baseline.
  - Right: nav `‹` / **Today** / `›` then **MONTH|WEEK** segmented.
    - `‹` and `›`: `border:1px solid var(--border); background:var(--surface); padding:3px 8px;`
    - **Today**: `border:1px solid var(--text); padding:3px 10px; font-size:0.72rem; weight:600;`
    - Segmented (`margin-left:6px; border:1px solid var(--text);`): active segment `background:var(--text); color:var(--surface);` inactive `color:var(--text-2);` both `padding:4px 12px; font-size:0.66rem; weight:700; text-transform:uppercase;`
- **Grid** (`display:grid; grid-template-columns:repeat(7,1fr);`):
  - Weekday headers SUN…SAT: `padding:6px 0; text-align:center; font-size:0.56rem; weight:700; letter-spacing:0.08em; color:var(--text-3);` + Fix 4 light bottom border.
  - **Day cell — `min-height:50px` (do NOT stretch taller); `padding:4px 5px;`** `border-right:1px solid var(--border)` except last column; `border-bottom:1px solid var(--border)` except last week. Today's cell: `background:var(--accent-soft);`
  - Day number: `font-size:0.66rem; font-variant-numeric:tabular-nums;` out-of-month `--text-3`; today `--blue` weight 800; else `--text-2` weight 500.
  - **Event pill:** `margin-top:2px; font-size:0.54rem; background:var(--blue-bg)(#E8ECF7); color:var(--blue); padding:1px 4px; border-right:2px solid var(--blue);` single line, ellipsis, `dir="rtl"`. (Show at most 2 per cell, then `+N more` at `0.5rem`, `--text-3`.)

#### B2. Up Next (`.upnext`) — flex column per Fix 5.
- Header: `padding:12px 16px;` light bottom border; **"Up Next"** Bricolage `1.05rem`/800, ls −0.03em.
- **Row:** `padding:11px 16px; gap:12px; border-bottom:1px solid var(--border); align-items:flex-start; cursor:pointer;` hover `background:var(--surface-sunk);`
  - **Date col** (`width:30px; text-align:center; flex-shrink:0;`): day number Bricolage `1.2rem`/800, lh 1; under it `"JUN · TUE"` `0.46rem`/700, letter-spacing 0.05em, `--text-3`, `margin-top:2px`.
  - **Info** (`flex:1; border-left:2px solid <artistColor>; padding-left:10px; min-width:0;`):
    - Artist `0.56rem`/700, letter-spacing 0.06em, UPPERCASE, colored (`--blue`/`--orange`).
    - Show name `0.82rem`/700, **Assistant**, `dir="rtl"`, `margin:2px 0`.
    - Meta `time · venue` `0.7rem`, `--text-3`, `dir="rtl"`.

### C. My Tasks (`.mytasks`) — compact peek
- `margin-top:18px`.
- Header (`display:flex; align-items:center; gap:10px; margin-bottom:12px;`): **"My Tasks"** Bricolage `1.15rem`/800; count badge `0.62rem`/800, `background:var(--text); color:var(--surface); padding:2px 8px;` tabular-nums; `"· assigned to you"` `0.72rem`, `--text-3`; then a `flex:1; height:1px; background:var(--border);` rule.
- Card: Fix 1 shell, `display:grid; grid-template-columns:1fr 1fr;` (two columns).
- **Task row:** `dir="rtl"; display:flex; align-items:center; gap:10px; padding:11px 14px;` `border-bottom:1px solid var(--border)` on rows that aren't last in their column; `border-left:1px solid var(--border)` on left-column cells.
  - **Checkbox:** Fix 2 (16px square, 1.5px `--border-strong`).
  - Task text: `flex:1`, **Assistant** `0.84rem`/600, `--text`.
  - Date: `0.66rem`, `--text-3`, format **`06-07`** (MM-DD) — **no "Due", no year, no full date.** (Current build's `Due 2026-06-07` is wrong.)

---

## Quick measurement reference (memorize these)
| Thing | Value |
|---|---|
| Card border | `1px solid #1A1714` (ink) |
| **Inner lines** (calendar bars, weekday row, grid, task dividers) | `1px solid #DDD7CE` (**light**) |
| Header divider (filter sits on it) | `2px solid #1A1714` (ink) — the only dark inner line |
| Card shadow | `4px 4px 0 #EBE7E0` (flat, no blur) |
| Calendar cell | `min-height:50px; padding:4px 5px` |
| Body columns | `grid 1.55fr 1fr, gap 18px, align-items:stretch` |
| Task checkbox | `16×16, 1.5px #C8C1B5, square` |
| Task date | `06-07` (MM-DD only) |
| Today title | `clamp(2rem,3.2vw,2.55rem)/800`, date **inline** |
| Marquee | `0.72rem/700, 0.12em, opacity .55, 70s` |
| Radius | **0** everywhere |

## Tokens (from `App.css`)
`--bg #F1EEE9` · `--surface #FBF8F2` · `--surface-2 #FFFDF8` · `--surface-sunk #EBE7E0` · `--border #DDD7CE` · `--border-strong #C8C1B5` · `--text #1A1714` · `--text-2 #6B6259` · `--text-3 #A39A91` · `--accent/--blue #3852B4` · `--accent-soft/--blue-bg #E8ECF7` · `--orange #F08D39`.
Fonts: **Bricolage Grotesque** (display/numbers/labels), **Assistant** (body/Hebrew, `dir="rtl"`).

## Files
- `Home Optimized.html` — the reference. Open it and diff visually against the live page; every inline style in it is authoritative for anything not spelled out above.
- Repo: apply to the existing `Dashboard` component + `App.css`.

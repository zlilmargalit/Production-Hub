# Handoff: Space Efficiency — Compact Page Headers, Permissions, Filter

## Overview
A systemic layout fix for **Production Hub** (React, Hebrew-first / RTL, warm-beige design system).
Across the app, every page opens with a giant display heading + a row of full-height stat cards that
together consume **~30% of the viewport (~430px)** before any real content appears — so the actual
content (member list, shows, etc.) sits below the fold and requires scrolling.

This package proposes three changes, in priority order:

1. **Compact page-bar** (systemic — applies to every page: Teams, Shows, Crew, Tasks…) — collapse the
   oversized heading + stat cards into a single ~90px-tall bar with inline metrics.
2. **Content Permissions matrix** — replace the three tall permission rows with a compact View/Edit grid.
3. **Filter panel** — convert the vertical month list into wrapping chips and add a summary/apply footer.

## About the Design Files
`prototypes/Space Efficiency.html` is an **interactive design reference** with Current-vs-Proposed
toggles for each of the three areas. It is **not production code to copy** — recreate the patterns inside
the existing React codebase, reusing the app's existing components, CSS variables, and `.show-*`/layout
classes. The HTML/inline-styles are illustrative; map them onto the real tokens.

The app is **RTL / Hebrew-first**: `dir="rtl"`/`dir="auto"` on text; numbers (counts, times) are LTR with
`font-variant-numeric: tabular-nums`. Corners are square (no border-radius) except avatars.

## Fidelity
**High-fidelity** for spacing, type scale, and tokens — but the heading sizes and exact paddings below are
the *intent*; match them to the app's existing spacing scale where one already exists.

---

## Change 1 — Compact Page-Bar (the systemic fix)

### Current (problem)
- Display heading e.g. `Teams.` at ~4–4.2rem (huge), then a `01 — members` eyebrow row, then a
  `grid-template-columns: repeat(4,1fr)` of stat cards each ~104px tall with a 2.4rem number.
- Total height before content ≈ **430px**. Content starts below the fold.

### Proposed
Replace the whole block with a single header strip (~90px incl. tabs):

- **Row 1** — `display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap`:
  - **Left:** heading at **~1.7rem** (`Bricolage Grotesque`, weight 800, `letter-spacing:-0.04em`), with the
    accent-dot kept (`Teams` + colored `.`). Beside it, an inline count eyebrow (`1 member`,
    `0.66rem`, uppercase, `--ink-3`).
  - **Right:** **inline metric strip** — a single bordered row (`1px solid var(--border-strong)`,
    `background:var(--surface)`) of segments divided by `1px solid var(--border)`. Each segment:
    `padding:6px 16px`, a bold number (`~1.1rem`, Bricolage 800) + a small uppercase label
    (`0.6rem`, `--ink-3`). e.g. `01 Total · 00 Backline · 00 Sound · 00 Lighting`.
- **Row 2** — the existing Members / Invite / Activity tabs, placed **immediately** under the strip
  (square segmented control, active = filled `--ink`, count chip in `--orange`).
- Content (member list / show list) begins right after — **above the fold**.

### Make it sticky
The page-bar should be `position:sticky; top:<navbar height>; z-index:…; background:var(--bg)` so it stays
visible while scrolling the list. Add a hairline bottom border when stuck.

### Where the big type goes
Keep the oversized display heading **only** for landing / empty states (e.g. a brand-new workspace with
zero members), not for populated working screens.

### Reuse everywhere
This page-bar is a **shared component**. Build it once (props: `title`, `accentColor`, `count`,
`metrics: [{value,label}]`, `tabs`, `actions`) and use it on Teams, Shows, Crew & Types, Tasks. That
single change reclaims ~340px on every page.

---

## Change 2 — Content Permissions Matrix

**Screen:** Teams → member detail → Content Permissions (Schedule, Logistics, Technical, each with View/Edit).

### Current (problem)
Three tall rows (~16px vertical padding each), each with a title + description on the left and two
spaced-out checkboxes pushed to the far right. The **Save** action is grey, right-aligned, and buried at
the bottom. Total ≈ **290px**.

### Proposed (~150px, −48%)
A compact bordered matrix:
- **Header row** (`background:var(--sunk)`, `border-bottom:1px solid var(--ink)`): columns `Area | View | Edit`
  (`grid-template-columns: 1fr 64px 64px`), labels `0.58rem` uppercase `--ink-3`.
- **One row per area**: title (`0.85rem`, weight 700) + its description **inline** beside it
  (`0.68rem`, `--ink-3`), then two cells. Each cell is a **full-cell toggle button** (38px tall) — clicking
  anywhere in the cell flips it; checked state fills the cell `var(--green-bg)` and shows a `var(--green)`
  check box. Cells divided by `1px solid var(--border)`.
- **Save** becomes a small solid `var(--ink)` button at the top-right of the section (not grey, not buried).

Same information, ~half the height, larger hit targets (whole cell, not a tiny checkbox).

---

## Change 3 — Filter Panel

**Component:** the SHOWS filter dropdown (MONTH + TYPE).

### Current (problem)
MONTH is a vertical stack of full-width buttons (`All`, `May 2026`, … `October 2026`) → 7 stacked rows,
making the panel very tall before TYPE even begins.

### Proposed
- **MONTH** becomes wrapping **chips** (same chip treatment as TYPE): `display:flex; flex-wrap:wrap; gap:6px`,
  each `padding:5px 12px`, active = filled `--ink`. Short labels (`All`, `May`, `June`…). Collapses 7 rows → ~2.
- **TYPE** stays as wrapping chips.
- Add a **section `Clear`** link (top-right of MONTH) and a **footer bar** (`background:var(--sunk)`,
  `border-top:1px solid var(--ink)`): a summary `Showing {month} · {type}` on the left and a solid
  **Apply** button on the right.
- Panel width ~340px. Overall height roughly halved.

---

## Design Tokens (reuse the app's existing CSS variables)
```
--bg:#F1EEE9  --surface:#FBF8F2  --surface-2:#FFFDF8  --sunk:#EBE7E0
--border:#DDD7CE  --border-strong:#C8C1B5
--ink:#1A1714  --ink-2:#6B6259  --ink-3:#A39A91
--orange:#F08D39  --orange-bg:#FCE3CC  --clay:#C26C1F
--blue:#3852B4  --blue-bg:#E8ECF7  --green:#16A34A  --green-bg:#ECFDF3
```
- Fonts: `Bricolage Grotesque` (headings/labels, tight tracking), `Assistant` (Hebrew body).
- Square corners; 1px borders; hairline dividers `--border`; strong borders/`--ink` for emphasis.
- `prefers-reduced-motion`: gate the progress-bar / sticky transitions.

## General principles (apply across all pages)
- **Sticky compact page-bar** on every screen — never repeat the full-height heading on working views.
- **Stats as an inline strip**, not full-height cards.
- **Primary action (Save/Apply) always visible** at the top of its section, in `--ink`, not grey at the bottom.
- Optional **Comfortable / Compact density toggle** for users managing large crews.
- Treat **the fold as a target**: main content should begin within the first screen, no scroll.

## State / behavior
- Page-bar metrics are derived counts — no new persisted state.
- Permissions matrix toggles write to the existing member-permissions object (same shape as today —
  per-area `{ view, edit }`); only the UI changes.
- Filter chips drive the existing show-filter state; `Apply` commits, `Clear` resets to `All`.

## Files
- `prototypes/Space Efficiency.html` — Current-vs-Proposed for all three areas (tabbed) + a principles list.

## Relevant existing source
- The page/heading layout used by Teams / Shows / Crew (extract a shared `PageHeader`/page-bar component).
- The Teams member-detail permissions block.
- The Shows filter dropdown component.
- App stylesheet — existing CSS variables and layout classes to reuse.

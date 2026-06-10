# Handoff: Production Hub — Mobile Responsiveness Repair

## Overview
The Production Hub web app (a Hebrew/RTL show-production management tool) renders broken on mobile: horizontal overflow, right-edge clipping, squashed action rows, an unreachable permissions matrix, and overlapping bottom tabs. This package contains **6 redesigned, mobile-first screens** that fix these issues, plus the exact CSS rules behind each fix.

The screens covered:
1. **Show detail** — the expanded show card (Technical coordination + Logistics)
2. **Shows list** — the show card list (Brief/PDF, Invoice/Receipt)
3. **Crew & Event Types** — manager with squashed action rows
4. **Tasks** — RTL Hebrew task rows
5. **Automations & Recipes** — connected apps, recipes, custom rule builder
6. **Teams & Permissions** — the content-permissions matrix + member tabs

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing the intended look and responsive behavior, **not production code to copy directly**. The task is to **recreate these layouts inside the existing Production Hub codebase** (React — the original components are `.jsx` files using a Tailwind-flavored utility setup) using its established components, state, and data. Where this README gives plain CSS, translate it to the codebase's styling approach (Tailwind classes, CSS modules, etc.).

Treat the prototypes as the source of truth for **layout, breakpoints, hit-targets, and interaction patterns** — not for data wiring. The real data, handlers, and API calls already exist in the app; you are changing how existing components lay out and reflow on small screens.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, hit-targets, and interactions are all specified. Recreate the responsive behavior precisely. The visual system (fonts, palette) already matches the live app — reuse the app's existing tokens rather than introducing the ones here verbatim if the app already defines equivalents.

---

## The Root Cause (fix this globally first)
Almost every screenshot shows the same failure: **content wider than the viewport**, so the page scrolls sideways and clips its edge. In RTL the clip eats the *right* (leading) side, hiding primary actions. Four global rules stop it everywhere; then each screen gets its specific layout fix.

```css
/* 1. Nothing may push the page sideways */
html, body { max-width: 100%; overflow-x: hidden; }   /* or overflow-x: clip */

/* 2. Flex/grid children must be allowed to shrink so long
      Hebrew strings wrap instead of forcing overflow */
.flex > *, .grid > * { min-width: 0; }

/* 3. Tab bars & the account/workspace cluster become scroll
      tracks instead of overflowing the page */
.ph-nav, .ph-switchers { overflow-x: auto; scrollbar-width: none; }
.ph-nav::-webkit-scrollbar, .ph-switchers::-webkit-scrollbar { display: none; }

/* 4. Every interactive element meets the iOS thumb-target floor */
button, .tap, input[type="checkbox"], .toggle { min-height: 44px; }
```

Tailwind equivalents: `overflow-x-hidden`, `min-w-0`, `overflow-x-auto`, `min-h-[44px]`.

---

## Screens / Views

### 1. Show detail — expanded card
**Purpose:** Coordinate one show's technical and logistics details inline.
**Layout:** Single column. Show header (RTL title, date · venue · time meta) → internal "Production Hub" panel with a 2-tab switch (Technical / Logistics) → footer (Brief/PDF buttons left, Invoice/Receipt checkboxes right).

**Components & fixes:**
- **Technical coordination** — each modality (Sound, Lighting) is a **self-contained block**: a toggle switch on top, its rental fields (Rental needs, Supplier) stacked underneath. When off, the fields hide (`display:none`).
- **Transport (Taxi / Van / Self)** — a **3-up equal grid** (`grid-template-columns:1fr 1fr 1fr`, gap 8px) of 44px-min buttons; collapses to a single column under 360px. Selected pill: blue border + `--blue-bg`.
- **Field pairs** (Driver/Time, Name/Phone) — `grid 1fr 1fr`, stacking to one column under 360px.
- Inputs are full-width, 44px min-height, with `dir="auto"` (Hebrew) or `dir="ltr"` (phone/time) per field.

```css
.tc-fields { display:grid; gap:12px; }
.tc-mod:not(.on) .tc-fields { display:none; }
.seg3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
.seg3 button { min-height:44px; }
@media (max-width:359px){ .seg3, .pair { grid-template-columns:1fr; } }
.pair { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
```

### 2. Shows list — card anatomy
**Purpose:** Browse upcoming/past shows.
**Layout:** Page title → toolbar (Sync, Apply crew, + New show) → filter row (Upcoming/Past segmented + Filter) → stacked show cards.

**Card anatomy & fixes:**
- **Top row:** event-type chip (leading) + **single ⋯ button** (trailing) that opens a bottom action sheet (Edit show, Add task, Duplicate, Delete). This replaces the overlapping inline `+ Edit Delete` actions.
- **Title:** RTL, right-aligned, `text-wrap:balance`.
- **Meta line:** `flex-wrap` row (date · venue · time · avatar stack · crew count) — flows onto 2 lines cleanly.
- **Progress:** track + tabular-nums percent.
- **Footer:** `flex-wrap`, doc buttons (Brief/PDF) left, status chips (Invoice/Receipt) right, all 44px targets.
- Top accent band colored per event type (orange / blue).

```css
.scard-toprow { display:flex; justify-content:space-between; align-items:center; }
.scard-more   { width:44px; height:38px; }
.scard-meta, .scard-foot { display:flex; flex-wrap:wrap; gap:12px; min-width:0; }
.scard h3 { text-align:right; text-wrap:balance; }
```

### 3. Crew & Event Types — squashed actions
**Purpose:** Manage event types (default crew, fields, checklist) and crew members.
**Layout:** Page title → Event Types / Members segmented control → (Event Types) list of type cards / (Members) grouped crew cards.

**The action-row problem:** the original `CREW / FIELDS / CHECKLIST / X` row crushed the RTL type name and clipped the X off-screen. **Three patterns are provided — pick one** (the prototype has a live switcher; "Sheet" is recommended):

- **A — Sheet (recommended):** type name gets full width; actions move behind a ⋯ button into a bottom sheet (Edit crew, Custom fields, Checklist, Delete).
- **B — Stacked:** a 2-column button grid below the name; Delete spans full width.
- **C — Scroll:** a horizontal chip strip (`overflow-x:auto`) when all actions must stay visible.

```css
/* A */ .mode-sheet .etactions { display:none; }
        .mode-sheet .etcard-more { display:grid; }
/* B */ .mode-stack .etactions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .mode-stack .etactions .x { grid-column:1/-1; }   /* Delete full-width */
/* C */ .mode-scroll .etactions { display:flex; overflow-x:auto; gap:8px; }
```

**Crew member cards (Members view):** avatar + RTL name/role; contacts in an LTR-aligned list; **tags `flex-wrap`** (no more right-edge bleed); Edit/Delete become a **persistent footer** (two 44px buttons) instead of hover-only actions (there is no hover on touch).

```css
.crew-tags { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
.crew-foot button { flex:1; min-height:44px; }
```

### 4. Tasks — RTL Hebrew rows
**Purpose:** Track production tasks grouped by date status.
**Layout:** Active/Completed tabs → grouped task lists (Scheduled, No date) inside bordered cards.

**The RTL problem:** title, date pill and event-type tag shared one cramped baseline and overlapped; LTR layout + RTL text floated chips to the wrong side.

**Fix — stable LTR scaffold, RTL content inside:**
- Each row is `flex` with three parts: **leading 44px checkbox · content block · trailing ⋯ button**. This scaffold stays LTR so structure never moves.
- Inside the content block, the title is `dir="rtl"` and right-aligned; meta chips (`.tmeta`) `flex-wrap` and `justify-content:flex-end` so they hug the right edge and never collide with the title.
- Date pills: muted (`.date`) vs overdue (`.due`, orange) with tabular-nums.
- Completed: line-through + muted, checkbox filled blue.

```css
.trow   { display:flex; align-items:flex-start; gap:12px; }
.tcheck { width:26px; min-height:26px; }          /* the row itself is 44px+ tall */
.tmore  { width:44px; }
.ttitle { text-align:right; }                     /* element has dir="rtl" in markup */
.tmeta  { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:7px; }
```

### 5. Automations & Recipes
**Purpose:** Connect apps, activate recipe templates, build custom rules.
**Layout:** Page title → "Connected apps" card → Recipes (stacked cards) → "Build a custom rule" pipeline.

**Fixes:**
- **Connected apps:** Gmail/Calendar/Drive pills `flex-wrap` (`.apps-row`); "Manage integrations" is a full-width button.
- **Recipe cards:** flat, full-width, single accent strip on top (no heavy offset shadow crowding text); CTA is a full-width button.
- **Custom rule builder:** a **vertical pipeline** — tagged steps (TRIGGER / CONDITIONS / ACTION, each a colored `.btag`) joined by ↓ connectors, ending in a full-width Save button. Replaces the cramped horizontal builder.

```css
.apps-row { display:flex; flex-wrap:wrap; gap:8px; }
.builder  { display:flex; flex-direction:column; }
.bstep    { padding:16px; border-top:1px solid var(--border); }
.recipe .btn { width:100%; }
```

### 6. Teams & Permissions — the matrix
**Purpose:** Manage a member's content permissions and assignments.
**Layout:** Page title → Members/Invite/Activity segmented → member card (avatar, name, role) → **Content Permissions** → member tabs (Assigned Tasks / Upcoming Shows / Recent Activity).

**The matrix problem:** a 3-column `Area / View / Edit` table was wider than the screen, so the toggle columns were unreachable; the bottom tabs overlapped the add-task form.

**Fix — kill the table, use per-area cards:**
- Each permission area (Schedule, Logistics, Technical) is a **card** showing its name, sub-fields, and **two large View / Edit toggles** in a `grid 1fr 1fr`. **Editing implies viewing** — turning Edit on auto-enables View; turning View off disables Edit.
- **Member tabs** become an equal-width segmented control (`flex:1; min-width:0`); the active pane's form sits clearly beneath it — no overlap.
- **Add-task row stacks:** event-type select on its own line, then text input + Add button on the next line.

```css
.area    { border:1px solid var(--border); border-radius:12px; padding:13px 14px; }
.toggles { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.tg      { min-height:44px; }
.mtabs button { flex:1; min-width:0; }
.addtask { display:grid; gap:8px; }
```

**Toggle dependency logic (from the prototype):**
```js
// Edit on  -> force View on
// View off -> force Edit off
if (type === 'edit' && editOn)  setView(true);
if (type === 'view' && !viewOn) setEdit(false);
```

---

## Interactions & Behavior
- **Tabs/segmented controls** (Technical/Logistics, Event Types/Members, member tabs) — toggle `active` class, show/hide the matching pane via `hidden`.
- **Bottom action sheet** — `⋯` opens a sheet that slides up from the bottom (`transform: translateY(100%) → 0`, `0.26s cubic-bezier(.32,.72,0,1)`) over a scrim (`rgba(26,23,20,.42)`, fade 0.22s). Tap scrim to dismiss. Use for show actions, event-type actions, task actions.
- **Toggles/switches** — Sound/Lighting coordination, transport mode select, View/Edit permissions. 42×25px pill, 20px knob, slides 17px, `0.18s`.
- **Task checkbox** — tap toggles done state (fill blue + ✓, title line-through + muted).
- **Responsive** — single breakpoint at **360px** for the tightest grids (transport, field pairs collapse to one column). Everything else fluidly reflows via flex-wrap/grid. The report shell also previews 360 / 390 / 430px widths.
- **Reduced motion** — entrance animations are transform-only (never leave content at `opacity:0`), gated behind `prefers-reduced-motion: no-preference`.

## State Management
These already exist in the app's components; the redesign only changes layout. Relevant local state per screen:
- **Show detail:** active hub tab (`tech`/`log`), per-modality on/off, transport mode, field values.
- **Shows list / Crew / Tasks:** open action-sheet target, filter/segment selection, checkbox/completion state.
- **Crew:** action-pattern choice is a *design decision*, not runtime state — pick one pattern and ship it (don't ship the switcher).
- **Teams:** per-area `{view, edit}` booleans with the dependency rule above; active member tab.

## Design Tokens
Colors (the prototype's values — map to the app's existing tokens where they exist):
```
--bg:#F1EEE9   --surface:#FBF8F2   --surface-2:#FFFDF8   --sunk:#EBE7E0
--border:#DDD7CE   --border-strong:#C8C1B5
--ink:#1A1714   --ink-2:#6B6259   --ink-3:#A39A91
--orange:#F08D39  --orange-bg:#FCE3CC  --clay:#C26C1F
--blue:#3852B4    --blue-bg:#E8ECF7
--green:#4E7265   --violet:#6B4FA3   --violet-bg:#ECE6F5
--bad:#B0473C (destructive)
```
Spacing: page gutter `--gut:16px`; card padding 14px; gaps 8–12px.
Radii: buttons/fields 9–10px, cards 12–14px, sheet 20px (top), pills 999px.
Hit target: `--tap:44px` (minimum for every interactive element).
Typography:
- Display (titles, names): **Bricolage Grotesque**, 800, letter-spacing −0.02 to −0.04em.
- Text/UI/Hebrew: **Assistant**, 400–800.
- Mono (code/specs only): JetBrains Mono.
- Slide/page titles `clamp(1.9rem, 9vw, 2.4rem)`; body 0.9–1rem; labels 0.62–0.68rem uppercase, letter-spacing 0.14–0.16em.

## RTL Notes
Per the design decision, RTL is handled **pragmatically, not re-architected**: the app chrome/layout stays LTR; Hebrew text elements get `dir="rtl"` (or `dir="auto"` for mixed) and right alignment, and chip/tag groups use `justify-content:flex-end`. This stops clipping and baseline issues without a full bidi rewrite. A future full-RTL pass (mirroring the whole layout with `dir="rtl"` on the root + logical properties) can build on this.

## Assets
No raster assets. The Production Hub logo and all icons are inline SVG (status bar, integrations, etc.). Fonts load from Google Fonts (Bricolage Grotesque, Assistant, JetBrains Mono).

## Files
- `Production Hub — Mobile Fixes.html` — the annotated report: 6 fixed screens in live phone frames, each with diagnosis + CSS rules, plus a 360/390/430 device-width toggle. **Start here.**
- `mobile-fix/ph.css` — shared stylesheet: design tokens, app chrome (status bar, header, nav, switchers), buttons, fields, bottom-sheet, and the global overflow fixes. Every screen links this.
- `mobile-fix/screens/show-detail.html` — Screen 1
- `mobile-fix/screens/shows-list.html` — Screen 2
- `mobile-fix/screens/crew.html` — Screen 3 (with the action-pattern switcher)
- `mobile-fix/screens/tasks.html` — Screen 4
- `mobile-fix/screens/automations.html` — Screen 5
- `mobile-fix/screens/teams.html` — Screen 6

Each screen file is standalone and openable directly. Original app source (for data/handler reference) lives in the project's `uploads/` as `.jsx` files (ShowCard, CrewManager, TaskManager, AutomationsPage, TeamsPage, TeamPanel).

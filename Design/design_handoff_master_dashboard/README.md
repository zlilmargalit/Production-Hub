# Handoff: Master Dashboard (Global Home)

## Overview
A new **global home page** for the Agency Producer — a cross-artist view that aggregates
data across ALL productions. It has three core regions:

1. **Master Calendar** — month grid, events color-coded by artist, with artist filter chips and a click-to-open Quick View popover.
2. **Up Next** — chronological agenda of the next ~7 shows with "missing critical item" indicators.
3. **Task Inbox** — split into *My Tasks* and *Red Flags / Overdue*.

## About the design file
`Master Dashboard.html` is a **design reference** — a standalone HTML/JS prototype showing the
intended look, layout, and interactions. **Do not ship the HTML.** Recreate it inside the existing
Production Hub React app using its established patterns (see below). The HTML uses vanilla JS only
to demonstrate behavior; the real implementation is React + the existing `App.css` system.

## Fidelity
**High-fidelity.** Colors, type, spacing, borders, and shadows are final and already match the
Nordic editorial system in `src/App.css`. Recreate pixel-faithfully using existing CSS tokens and
classes — most styling already exists in `App.css`; add new classes only for the calendar/agenda/task
primitives that don't exist yet.

## Existing codebase conventions (MUST follow)
- **React, no router.** Navigation is `page` state in `src/App.jsx` (`'shows' | 'crew'`). Add a new
  `'home'` page and a "Home" nav button; make it the default landing page.
- **Data via `fetch('/api/...')`** with `useCallback` fetchers in `App.jsx`. Existing endpoints:
  `/api/shows`, `/api/crew`, `/api/templates`, `/api/field-templates`, `/api/event-types`.
- **Styling is class-driven** through `src/App.css` (cream surfaces, indigo `--accent` #3852B4, amber/orange,
  Bricolage Grotesque + Assistant + Heebo, chunky 1.5px borders + hard offset shadows). Reuse tokens.
- Hebrew content exists — keep `dir="auto"` and the `:lang(he)` font behavior on user text.

## Data model (from `/api/shows`)
A show object has at least: `id`, `name`, `date` (ISO `YYYY-MM-DD`), `venue`, `eventType`,
`crewIds` (array → join against `/api/crew`), `invoice` (bool), `receipt` (bool), `archived` (bool),
`technicalCrew`, `loadIn`?, `contacts`, `venueContact`. Crew objects have `id`, `name`, `role`
(e.g. `'נגן'` = musician). Per-show tasks are handled by the existing `TaskManager` component.

## ⚠️ Critical gap: there is no `artist` / tenant field yet
The dashboard color-codes and filters by **artist**, but shows currently have no artist/tenant
attribute. Before building, decide the mapping with the product owner. Options:
- **(A)** Add an `artistId` (or `artist`) field to the show model + `/api/artists` endpoint, and a
  stable color per artist. Preferred for true multi-tenant.
- **(B)** Temporarily derive "artist" from an existing field (e.g. `eventType` or a crew member) until
  the model is extended.
Do not invent silent defaults — confirm which approach.

## Regions in detail

### 1. Master Calendar
- Month grid (7 cols × up to 6 rows). Leading/trailing days from adjacent months are muted (`.out`).
- Today cell highlighted with `--accent-soft` background + filled accent day-number.
- Each show renders as an **event pill**: left color bar in the artist color, `HH:MM` time, artist/show
  name (ellipsis), and a small red warn dot when the show is missing a critical item.
- Max 2 pills per cell, then `+N more`.
- **Artist filter chips** above the grid (incl. "All artists"): toggling re-filters both the calendar
  and the Up Next agenda. Off state = dashed border, muted.
- **Quick View popover** on event click: artist label, show name, date + doors, **load-in time**,
  **venue + address**, **key crew** (avatar initials + name + role, e.g. "Roni Maor — Backliner"),
  a flag row ("Missing crew" / "No invoice" / "Fully staffed"), and an "Open show →" link
  (should route to the existing ShowCard/ShowForm for that show). Popover flips to stay inside the
  calendar card; closes on outside click / ✕ / re-click.

### 2. Up Next (sidebar)
- Sorted upcoming shows (next ~7) across active artists. Each row: big day number + "Jun" + weekday,
  artist color bar, artist label, show name, time · venue, and flag pills:
  `Missing crew` (danger/red) and `No invoice` (warn/amber). Derive flags from real data
  (e.g. crew unassigned → missing crew; `!invoice` near show date → no invoice).

### 3. Task Inbox
- Two columns. **My Tasks** = tasks assigned to the logged-in producer (working checkboxes, strike-through
  on complete, artist tag + due date). **Red Flags / Overdue** = tasks assigned to *other* crew that are
  past due — shows assignee avatar + name and an "Overdue Nd" pill; column has a red offset shadow.
- Source tasks from the existing task system (`TaskManager`/per-show tasks). Confirm whether a
  cross-show task endpoint exists or needs adding (e.g. `/api/tasks`).

## Design tokens (already in App.css; artist palette is new)
- Surfaces: bg `#F1EEE9`, surface `#FBF8F2`/`#FFFDF8`, sunk `#EBE7E0`
- Ink: `#1A1714` / `#6B6259` / `#A39A91`; borders `#DDD7CE` / `#C8C1B5`
- Accent indigo `#3852B4` (hover `#2D4399`), danger `#C0392B`
- **Artist palette (new):** indigo `#3852B4`, terracotta `#F08D39`, mustard `#C79A3F`, teal `#4E7265`
  — pair each with a soft bg tint (see `:root` in the HTML).
- Shadows: hard offset e.g. `5px 5px 0 var(--text)`; danger variant `5px 5px 0 var(--danger)`.

## Files
- `Master Dashboard.html` — the design reference (open in a browser to see all interactions).
- Target repo files to touch: `src/App.jsx` (add `home` page + nav + fetchers), a new
  `src/components/Dashboard.jsx` (+ sub-components `MasterCalendar`, `UpNext`, `TaskInbox`),
  and additions to `src/App.css` for the calendar/agenda/task classes.

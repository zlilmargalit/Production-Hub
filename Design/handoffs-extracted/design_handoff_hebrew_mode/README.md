# Handoff: Hebrew interface mode (RTL) — Production Hub

## Overview

Production Hub is an administration workspace for a music-production stylist: shows, crew, tasks, automations, office team, tools, and a time log. This handoff covers adding a **Hebrew interface mode** — a full RTL interface language alongside English.

The core constraint that shapes every decision here: **interface strings are translated, content is not.** A show is called `סולו מועדון הג׳ורג׳ ת״א` in both modes. An artist is `Assaf Amdursky` in both modes. A phone number is `054-7298501` in both modes. The interface language flips the shell; the data stays exactly as the user typed it. That means the app is permanently bidirectional in both language modes, and every container that holds user content has to be direction-agnostic.

The handoff also covers a second, subtler problem: the English visual identity leans on a display gesture (a lowercase word plus a full stop — `shows.`) that has no Hebrew counterpart. Two Hebrew heading systems are prototyped so the team can pick one.

## About the design files

The files in this bundle are **design references created in HTML/React-via-Babel** — a prototype demonstrating intended look and behavior. They are not production code to copy directly.

The task is to **recreate these designs in the target codebase's existing environment** using its established patterns, i18n library, and component primitives. The prototype uses inline Babel and global `window` assignment purely so it runs from a file; do not carry that pattern over. What *should* carry over verbatim: the CSS logical-property strategy, the bidi isolation rules, the typography adjustments per language, and the exact token values below.

## Fidelity

**High-fidelity.** Colors, typography, spacing, and interaction states are final. Recreate pixel-accurately using the codebase's existing libraries. All values are listed under Design Tokens.

## The bidi model (read this before anything else)

This is the part that is easy to get wrong and expensive to fix later.

### Rule 1 — No container assumes its content's direction

Any element rendering user-authored content gets `dir="auto"`, in **both** language modes. First-strong detection then resolves each string on its own. This applies to: show names, venue names, addresses, notes, crew names, roles, task text, activity descriptions, event-type names, contact names.

```html
<h2 dir="auto">סולו מועדון הג׳ורג׳ ת״א</h2>
<h2 dir="auto">Barbie Club Session</h2>
```

Both render correctly in an RTL page and in an LTR page. Neither is special-cased.

### Rule 2 — Numeric and Latin atoms are isolated LTR

Phone numbers, time ranges, dates, email addresses, URLs, counts, percentages, hour totals, and alphabet ranges (`א–ב`, `A–Z`) are wrapped in an isolate:

```css
.ltr { direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums; white-space: nowrap }
```

The failure this prevents is not theoretical. `18:15 – 22:20` in an RTL paragraph without isolation renders as `22:20 – 18:15` — the en dash is direction-neutral, so the bidi algorithm reorders the operands and the range silently inverts. A production schedule that says the show ends before it starts. Same class of bug for `054-7298501` (hyphens are neutral) and for any `a@b.co.il` sitting in a Hebrew sentence.

`unicode-bidi: isolate` rather than `embed` — isolation prevents the atom from influencing the surrounding text's resolved order, which `embed` does not.

### Rule 3 — Compound strings are decomposed into discrete elements

The original crew field was a single delimited string:

```
הפקה – צליל מרגלית | Sound – רני ליבנה | בקליין – Noam Moyal
```

The `|` and `–` delimiters are direction-neutral. In a mixed-script list the segments reorder unpredictably and the reader cannot tell which role belongs to which person. **There is no CSS fix for this** — the string has to stop being one string.

It is now a set of chips, each its own isolate:

```html
<div class="chips">
  <span class="chip" dir="auto"><span class="face">צ</span><b>צליל מרגלית</b><span class="role">הפקה</span></span>
  ...
</div>
```

Order is now guaranteed by DOM order. This is the single most important structural change in the handoff. Audit the codebase for any other delimited compound string built from user data — they all need the same treatment.

### Rule 4 — Schedule lines resolve per line

Each line is `dir="auto"` with the time as an isolated `<time dir="ltr">`, so a Hebrew line and an English line can sit adjacent in the same block and each resolves independently.

```html
<span class="line" dir="auto"><time dir="ltr">17:00</time> סאונדצ׳ק — Assaf Amdursky</span>
<span class="line" dir="auto"><time dir="ltr">18:15</time> Doors open</span>
```

### Rule 5 — Logical properties everywhere, no physical directions

`margin-inline-start`, `padding-inline-end`, `border-inline-start`, `inset-inline`, `text-align: start`. There is no RTL override stylesheet and there should not be one. The only `[dir="rtl"]` rules in the stylesheet are typographic (see below), never positional.

The progress bar fills from the inline start, so it runs right-to-left in Hebrew. This was a deliberate choice — flagged below as open.

### Rule 6 — Icon mirroring is semantic

**Mirror** (movement, progression, direction of travel): chevrons, back arrows, flow arrows, progress fills.
**Do not mirror** (objects): clock, trash, pencil, phone, mail, document, checkmark, plus, close.

```css
.mirror { display: inline-flex }
[dir="rtl"] .mirror { transform: scaleX(-1) }
```

A caret indicating expand/collapse rotates rather than mirrors, since vertical motion is direction-neutral.

## Typography: the two Hebrew heading systems

The English page header is a display word plus a full stop, Bricolage Grotesque 800, `letter-spacing: -.05em`, `clamp(3rem, 7vw, 5.25rem)`. Hebrew has no lowercase, so the gesture's contrast (small word, big weight, hard stop) does not transfer. Both candidates are implemented; the demo rail toggles between them.

**Candidate A — direct translation.** `הופעות.` in Heebo 900, `letter-spacing: -.02em`, `line-height: 1.02`. Same object, translated. Cheapest to ship. The period reads as ordinary punctuation rather than as a mark, so the editorial voice is quieter than the English.

**Candidate B — numeral-led.** The count becomes the display element (`07`) in Bricolage 800 at `clamp(3.4rem, 8vw, 6rem)`, `letter-spacing: -.06em`, with a 52×6px accent rule above it, an uppercase kicker, and the Hebrew word dropped to 1.75rem Heebo 800. Latin numerals keep the original typeface's voice, so the page still opens with a large editorial mark without asking Hebrew to imitate lowercase.

The prototype ships with B as the default. This is a brand decision, not an engineering one — surface both to whoever owns the identity.

### Per-language typographic adjustments

Hebrew has no case and letterspacing degrades Hebrew legibility badly. Every uppercase/tracked interface label needs a Hebrew branch:

| Element | English | Hebrew |
|---|---|---|
| Nav items | `.75rem`, 600, `.07em`, uppercase | `.8125rem`, 700, `.01em`, sentence case, `margin: 0 7px` |
| Stat labels | `.5625rem`, `.14em`, uppercase | `.6875rem`, `.05em`, no transform |
| Table headers | `.5625rem`, `.13em`, uppercase | `.6875rem`, `.03em`, no transform |
| Buttons | `.75rem`, `.05em`, uppercase | `.8125rem`, `.02em`, no transform |
| Filter tabs | `.8125rem`, `.04em`, uppercase | `.875rem`, `0`, no transform |
| Field labels | `.6875rem`, `.1em`, uppercase | `.75rem`, `.02em`, no transform |
| Day-of-week | `.5625rem`, `.13em`, uppercase | `.6875rem`, `.02em`, no transform |
| Body | `letter-spacing: -.005em` | `letter-spacing: 0` |

The pattern: **Hebrew goes up one size step and loses almost all tracking.** Hebrew strings also run roughly 25% shorter than English. Rather than padding the copy to fill the space, the nav tightens its tracking and raises its size, so the row keeps its optical measure.

### Font stacks

```css
--font-ui: 'Bricolage Grotesque', 'Heebo', system-ui, sans-serif;   /* LTR */
[dir="rtl"] { --font-ui: 'Heebo', 'Bricolage Grotesque', system-ui, sans-serif }
```

Bricolage Grotesque has no Hebrew coverage, so Hebrew falls through to Heebo. Latin content inside a Hebrew page (artist names, app names) is opted back into Bricolage with a `.lat` class so `Assaf Amdursky` keeps the display face. Numerals stay Bricolage in both modes — that is what makes candidate B work.

Google Fonts: `Bricolage Grotesque` (opsz 12–144, weights 400–800), `Heebo` (300–900), `Assistant` (400–800, fallback).

## Language switching

Changing the interface language **reloads the page**. This matches the product's existing behavior and avoids a class of hydration and layout-thrash bugs from swapping `dir` live. The prototype stages a 260ms fade to a full-viewport veil with a spinner and a "Reloading…" label, then swaps.

The switch is reachable from three places:

1. **Settings modal** — a `Language` row sitting between `Theme` and `Time zone`, as a two-button segmented control (`English` / `עברית`). Helper copy: *"Interface language. Your content stays exactly as you wrote it."* An inline amber note below the group: *"Changing the language reloads the page."*
2. **Registration, step 3 of 4** — a two-card picker. English card sublabel `Default`; Hebrew card sublabel `ממשק מלא מימין לשמאל`. Skippable.
3. **Demo rail** — prototype-only, not production.

On switch: set `document.documentElement.lang`, `dir`, persist the choice, scroll to top.

## Screens

All screens are `max-width: 1280px`, `padding: 44px 34px 60px`, centered.

### Header (sticky, all screens)
Height 62px, `background: var(--surface)`, `border-bottom: 1px solid var(--border-strong)`, `padding: 0 34px`, `z-index: 100`.

Brand mark: 30px circle, `conic-gradient(from 210deg, #3852B4, #F08D39, #F3BE7A, #3852B4)`. Wordmark "Production Hub", 1.24rem/800, `letter-spacing: -.045em`, Bricolage — untranslated in both modes.

Nav: horizontally scrollable, `scrollbar-width: none`. Active item gets `color: var(--text)` plus a 2px `var(--accent)` underline at `bottom: -2px`. A badge (17px pill, accent bg, white, `.6875rem`/700) carries counts. A 1px × 13px separator divides primary nav from `Time Log` / `Bidi lab`.

Right cluster: workspace switcher pill (1.5px `var(--text)` border, `border-radius: 999px`, accent dot, uppercase `WORKSPACE` label at `.55rem`/`.14em`, artist name at `.875rem`/700 with `dir="auto"`), a 30px theme-toggle icon button, and a 29px accent avatar circle opening a dropdown menu (`min-width: 210px`, `border-radius: 5px`, `box-shadow: 0 24px 60px -20px rgba(40,30,15,.22)`).

### Shows
The primary screen. Page header, then a filter bar, then a card grid.

**Filter bar:** a single bordered unit — `border: 1px solid var(--text)`, `box-shadow: 3px 3px 0 var(--text)`, `width: fit-content`, buttons divided by 1px inline-end borders. Active button: accent background, white text. Each carries a count chip (`.6875rem`/700, sunk background; on active, `rgba(255,255,255,.22)` on white). Filters: Upcoming / Past / Archived / All.

Right of the bar: a sort button cycling three states — `Date` → `Sort א–ב` → `Sort מיון A–Z`. The alphabet range is an isolated LTR atom while the verb translates; the label carries the alphabet being sorted, not the interface language. And a Filter button.

**Show card:** `background: var(--surface)`, `border: 1px solid var(--text)`, `box-shadow: 3px 3px 0 var(--text)`. Hover lifts to `translate(-2px,-2px)` / `5px 5px 0` — mirrored to `translate(2px,-2px)` in RTL. Grid is `repeat(auto-fill, minmax(455px, 1fr))`, gap 20px.

Structure top to bottom:
- 6px event-type color band
- Header row: event type (7px color dot + label, `dir="auto"`) · artist name (`.lat`, `.75rem`/600, `var(--text-3)`) — then expand caret, Edit, Delete as text buttons
- Title, 1.5rem/700, `letter-spacing: -.03em`, `dir="auto"`, single-line ellipsis
- Meta row: date (1rem/600 tabular, isolated, `white-space: nowrap`), venue (`dir="auto"`), time range (isolated LTR), phone (isolated LTR `tel:` link), crew count with three overlapping 17px avatar initials (`margin-inline-start: -6px`) — separated by `·` pseudo-elements
- Progress bar: 3px track, event-type fill, percentage in event-type color, tabular
- Expanded detail (see below)
- Footer: Brief / PDF document buttons on the inline-start, Invoice / Receipt checkboxes on the inline-end

**Expanded detail:** `background: var(--surface-sunk)`, two tabs (Technical / Logistics).
Technical: a 2-column dashed-divided grid — Technical Crew (chips), Schedule (bordered block of per-line-isolated rows), Rental gear, Notes. Fields sourced into the generated PDF carry a small `PDF` marker at `.625rem`/700, `.1em`, accent at 55% opacity. Below: a checklist grid of Brief sent / PDF saved / Calendar invite sent / Coordination sheet sent.
Logistics: Address, Parking, Transportation, Contacts (name + role + isolated `tel:` link per row).

### Show edit modal
`max-width: 880px`, `max-height: 88vh`, `border-radius: 5px`. Left rail 190px (sunk background, numbered sections, active item gets a 2px accent `border-inline-start`): Basics / Logistics / Schedule / Crew / Documents. Right pane scrolls.

Schedule section is a `22px 92px 1fr 30px` grid per row: drag grip, `<input type="time">` forced `direction: ltr`, `dir="auto"` text input, delete. Crew section groups selectable chips by role; selected chips go accent with a check.

All text inputs holding user content: `dir="auto"`. All inputs holding numbers, times, dates, phones, emails: `direction: ltr` explicitly.

### Today
Artist filter chips (All / per-artist with counts), then a `1.5fr 1fr` two-column split: a month calendar panel and an "Up Next" list panel. Below: a task card grid.

Calendar cells are 92px minimum, 1px borders on inline-end and bottom, last column drops its inline-end border. Today's cell gets `var(--accent-soft)` and an accent-weighted day number. Events are 3px-`border-inline-start` blocks in the event-type color with an isolated `HH:MM` prefix. Day-of-week headers translate to full Hebrew day names (`ראשון`, `שני`, …) — not abbreviations, since Hebrew day names do not abbreviate the way `Sun`/`Mon` do.

Up Next rows: 40px date column (day numeral 1.35rem/800, month abbreviation `.5625rem` uppercase), a 3px event-type stripe, then artist kicker / title / time · venue.

### Crew & Types
Two tabs. **Members**: grouped by role, `repeat(auto-fill, minmax(300px, 1fr))` grid. Each card has a 3px `border-inline-start` in the person's assigned color, name (`dir="auto"`), isolated `tel:` and `mailto:` links with leading icons, and event-type tags. **Event Types**: rows with color, Hebrew name, usage count, and default-crew tags.

### Tasks
A composer panel at the top (text input + date + time + assignee select + show select + Add), then Active / Completed tabs, then a two-column split of Scheduled vs. No date. Rows carry date, assignee, and linked-show tags.

### Automations
Connected-apps strip (28px rounded icon + name + status), then a recipe grid — each recipe shows a `Trigger → Action` flow with mirrored arrow, a description, and an Enable toggle button. Below: a three-column rule builder (Trigger / Conditions / Action), each column numbered with an 18px accent circle, divided by 1px inline-end borders, collapsing to stacked rows under 1100px.

### Teams
Members table / Invite form / Activity feed tabs. Table columns: Name (`dir="auto"`), Email (isolated LTR), Access (role tag), Artists (`.lat`), Last seen, edit action.

### Tools
Two panels. **Setlist Calculator**: numbered rows with `dir="auto"` song names and isolated `M:SS` durations, a top-bordered total row with the sum at 1.5rem/800 tabular. **Tech Spec Parser**: a `dir="auto"` textarea, a Parse button, and parsed-field result rows.

### Time Log
Artist filter chips with per-artist hour sums, then a table: Date (isolated `DD/MM/YYYY`), Artist (`.lat`), Description (`dir="auto"`), Hours (tabular, right-aligned in RTL), Billed, edit.

### Bidi lab
A prototype-only reference screen. Six side-by-side cases showing the unisolated failure (red) against the isolated fix (green): phone numbers, time ranges, schedule lines, compound strings, emails/URLs, mixed-script UI labels. Then a single show card rendered simultaneously in an LTR container and an RTL container, and an icon-mirroring reference. Useful as a QA checklist; not a production screen.

## Interactions & behavior

- Card expand/collapse — accordion, one open at a time. Caret rotates 180°.
- Card hover — `transform` + `box-shadow` over 200ms; suppressed while expanded.
- Primary button hover — `translate(-1px,-1px)` (mirrored in RTL) and shadow grows from `2px 2px` to `4px 4px`.
- Modals — overlay `rgba(20,20,25,.34)` + `backdrop-filter: blur(7px)`, 200ms fade; panel rises 12px over 250ms. Click-outside on the overlay (mousedown target check) and the header close button both dismiss.
- Language switch — 260ms veil, swap, 700ms total.
- Theme toggle — instant, via `data-theme="dark"` on `<html>`.
- Screen change — the main region is keyed on `lang + route` so it remounts; keeps focus and scroll predictable.
- Checkboxes, filters, sort, tabs, chip selection are all live local state.

Under 1100px: two-column splits, form grids, detail grids, the show grid, and the rule builder all collapse to one column.

## State

| State | Scope | Persisted |
|---|---|---|
| `lang` (`en` \| `he`) | app | yes |
| `theme` (`light` \| `dark`) | app | yes |
| `headingMode` (`a` \| `b`) | app (demo only) | yes |
| `route` | app | no |
| `editingShow` | app | no |
| `settingsOpen`, `signupOpen`, `notesOpen`, `reloadVeil` | app | no |
| open card id, detail tab, checklist state | Shows | no |
| artist filter, calendar view | Today | no |
| task list, active/completed tab | Tasks | no |
| enabled recipe ids | Automations | no |
| section, schedule rows, crew selection | Show modal | no |

Persisted values use `localStorage` keys prefixed `ph-he-`, wrapped in try/catch.

## Design tokens

### Light
```
--bg              #F1EEE9      --text            #1A1714
--surface         #FBF8F2      --text-2          #6B6259
--surface-2       #FFFDF8      --text-3          #A39A91
--surface-sunk    #EBE7E0      --accent          #3852B4
--border          #DDD7CE      --accent-hover    #2D4399
--border-light    #E7E2D9      --accent-soft     #E8ECF7
--border-strong   #C8C1B5
--amber #F3BE7A   --amber-deep #B07729   --amber-bg #FBEFD9
--orange #F08D39  --orange-deep #C26C1F  --orange-bg #FCE3CC
--success #3D7A51 --success-bg #EAF2EC
--danger  #C03B30 --danger-bg  #FBECEA
```

### Dark (`[data-theme="dark"]`)
```
--bg #161310        --surface #1E1B17     --surface-2 #25221D
--surface-sunk #121008
--border #2D2925    --border-light #252220 --border-strong #3D3833
--text #ECE7E0      --text-2 #9A9189      --text-3 #625A52
--accent #7A8FE0    --accent-hover #92A3E8 --accent-soft rgba(122,143,224,.12)
--success #7DD49A   --danger #E07A6F
--amber-deep #F3BE7A  --orange-deep #F08D39
```
Also set `color-scheme: dark` so form controls follow.

### Event-type colors
```
show      #3852B4 / bg #E8ECF7
rehearse  #6B7F56 / bg #EAEDE7
festival  #F08D39 / bg #FCE3CC
private   #B89050 / bg #F3EBDA
launch    #4E7265 / bg #E6EDEA
```

### Other
```
--radius 3px   --radius-lg 5px   --pill 999px
--shadow-card    3px 3px 0 var(--text)
--shadow-card-h  5px 5px 0 var(--text)
--shadow-btn     2px 2px 0 var(--accent)
--shadow-lg      0 24px 60px -20px rgba(40,30,15,.22)
```
In dark mode the hard offset shadows switch from `var(--text)` to `var(--border-strong)` — a light-on-dark hard shadow reads as a rendering error otherwise.

Spacing runs on a loose 4px base; the recurring values are 4 / 6 / 8 / 10 / 12 / 16 / 22 / 26 / 34 / 44.
Type scale: `.5625 / .625 / .6875 / .75 / .8125 / .875 / .9375 / 1 / 1.15 / 1.3 / 1.5 / 1.75rem`, then the two clamped display sizes.

## Screenshots

`screenshots/` holds reference captures of the prototype. Hebrew mode first, English second, so the pair can be compared screen by screen.

```
01-shows-hebrew-heading-b.png     Shows — heading candidate B (numeral-led), light
02-shows-card-expanded.png        Show card expanded — crew chips, schedule, checklist
03-today-calendar.png             Today — month calendar + Up Next
04-crew-and-types.png             Crew & Types — members grouped by role
05-tasks.png                      Tasks — composer + scheduled / no-date split
06-automations.png                Automations — apps, recipes, rule builder
07-teams.png                      Teams — members table
08-bidi-lab.png                   Bidi lab — failure/fix pairs, QA reference
09-show-edit-modal.png            Show edit modal — Basics section
10-settings-language.png          Settings — Language beside Theme and Time zone
11-shows-hebrew-heading-a.png     Shows — heading candidate A (direct translation)
12-shows-hebrew-dark.png          Shows — Hebrew, dark theme
13-shows-english.png              Shows — English
14-shows-english-expanded.png     Show card expanded — English
15-today-english.png              Today — English
16-crew-english.png               Crew & Types — English
```

Captured at ~924px wide, so the header nav is clipped on the inline end — that is the capture viewport, not the design. At the 1280px content width the nav sits fully within the header.

Compare 01 against 11 for the heading decision, and 01 against 13 for the language pair.

## Assets

No image assets. Icons are inline SVG at 24×24 viewBox, `stroke-width: 1.8`, `round` caps and joins, rendered at 13–16px — replace with the codebase's icon set, preserving the mirror/no-mirror classification above. The brand mark is a CSS conic gradient. Fonts come from Google Fonts.

## Open questions for the team

1. **Heading system A or B.** Brand decision. B is the prototype default.
2. **The PDF/download glyph.** A sheet (object, should not mirror) containing a download arrow (movement, should mirror). Currently not mirrored. Needs a call.
3. **Progress bar direction.** Fills from the inline start, so it runs right-to-left in Hebrew. Defensible as "progress follows reading direction," but worth testing — some users read a progress bar as a physical left-to-right gauge regardless of script.
4. **Audit for remaining compound strings.** The crew field was found and fixed. Anywhere else the codebase builds a display string from user data joined by a delimiter has the same latent bug.

## Files in this bundle

```
Hebrew Interface Mode.html    entry point, app shell, routing, language switch
hebrew-mode/ph.css            all styles, tokens, both themes, per-language type rules
hebrew-mode/i18n.js           interface strings only, EN/HE pairs, makeT() helper
hebrew-mode/data.js           demo content — never translated
hebrew-mode/shell.jsx         icons, bidi atoms, page header, app header, settings,
                              registration step, demo rail
hebrew-mode/screens-shows.jsx Shows screen, show card, crew chips, edit modal
hebrew-mode/screens-today.jsx Today screen, calendar, up-next
hebrew-mode/screens-rest.jsx  Crew & Types, Tasks, Automations, Teams, Tools, Time Log
hebrew-mode/lab.jsx           Bidi lab reference screen, design-notes drawer
```

`i18n.js` is the file to read first — the strict separation between translated interface strings and untranslated content is enforced there, and it is the contract the rest of the implementation depends on.

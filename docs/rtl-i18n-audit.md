# RTL / i18n Readiness Audit — client

**Scope:** `/Users/zlilmargalit/Desktop/Production-Hub/client/src` (~24,800 LOC)
**Date:** 2026-08-10
**Method:** static analysis only. No code changed.

> Note on location: `/Users/zlilmargalit/Production/client` contains only a stale Vite
> dep cache. The real client is `Desktop/Production-Hub/client`. All paths below are
> relative to that directory.

---

## Executive summary

The app is **further along than a greenfield RTL project, and further behind than it looks.**

| Axis | State |
|---|---|
| Bidi text handling (`dir="auto"`) | ✓ Strong — ~190 call sites already |
| CSS directionality | ✕ Weak — 164 physical declarations, ~10 logical |
| String externalization | ✕ None — ~1,029 hardcoded English strings, no i18n library |
| Direction as a user preference | ✕ Does not exist — `dir` is a hardcoded constant |

The single most important finding: **someone has already done the hard, subtle part**
(per-value bidi resolution on user data) and **none of the mechanical part**
(logical CSS, string extraction, a direction toggle). That is an unusual and
favorable position — the expensive judgment calls are made, the remaining work is
largely volume.

Second finding, and a live bug regardless of RTL plans:
`client/index.html:1` is `<html lang="he" dir="ltr">`. The document declares Hebrew
and then forces LTR. See §3.1.

---

## 1. CSS directionality

### 1.1 Totals

Three stylesheets: `src/App.css` (10,669 lines), `src/components/backliner/backliner.css`
(560), `src/components/automations/automations.css` (207).

**164 physical declarations** that break or misrender under `dir="rtl"`:

| Property | App.css | backliner.css | automations.css | **Total** |
|---|---:|---:|---:|---:|
| `margin-left` | 36 | 0 | 2 | **38** |
| `text-align: left \| right` | 30 | 2 | 0 | **32** |
| `right:` | 17 | 0 | 0 | **17** |
| `border-right*` | 16 | 0 | 0 | **16** |
| `transform: translateX` | 11 | 0 | 3 | **14** |
| `left:` | 12 | 0 | 1 | **13** |
| `border-left*` | 10 | 0 | 1 | **11** |
| `padding-left` | 9 | 0 | 0 | **9** |
| `margin-right` | 7 | 0 | 1 | **8** |
| `padding-right` | 6 | 0 | 0 | **6** |
| `float` | 0 | 0 | 0 | **0** |
| | **154** | **2** | **8** | **164** |

`float` is unused anywhere in the codebase. The layout is flexbox/grid throughout,
which is why the count is 164 and not 500 — most positioning is already
direction-agnostic by construction.

### 1.2 Logical properties already in use

**10 declarations, and only 3 of them are meaningful.**

| Declaration | Count | Assessment |
|---|---:|---|
| `inset: 0` / `inset: 2px` | 7 | Direction-safe, but shorthand — not evidence of intent |
| `text-align: start` | 3 | ✓ Deliberate |

The three real ones:

- `App.css:8808` — `.gl-textarea` (guest list)
- `App.css:9774` — `.tlog-row-desc` inside a `@media (max-width: 720px)` block
- `App.css:10476` — `.he { text-align: start; }` — a documented utility class

**Zero** uses of `margin-inline-start/end`, `padding-inline-*`, `border-inline-*`,
or `inset-inline-*`.

The `.he` utility at `App.css:10469-10477` carries a comment explaining the design
intent, and it is correct: it sets alignment only, never direction, and is meant to
pair with `dir="auto"`. That pattern is the right one — it is just applied to 3
rules out of 164.

### 1.3 Layout-critical vs. cosmetic

**Layout-critical (~95 declarations).** These change where a user must look or click:

*Navigation and header*
- `.page-nav` — `margin-left: 48px` (`App.css:264`), `20px` at ≤1020px (`:273`), `0` at mobile (`:3950`)
- `.header-right` — `margin-left: auto` (`:283`, `:3990`) — the auto-margin push that positions the entire right cluster
- `.nav-btn.active::after` — `left: 0; right: 0` (`:308`) — active-tab underline
- `.nav-tasks-badge` / `.crew-task-badge` — `margin-left` (`:4063`, `:4079`)
- `.tools-sidebar` — `border-right` (`:5414`); `.tools-nav-item--active::before` — `left: 0` (`:5438`)
- `.tools-nav-dropdown-panel` — `left: 0` (`:5384`); `.tools-nav-item` / `.tools-nav-dropdown-item` — `text-align: left` (`:5428`, `:5393`)
- `.sf-rail` — `border-right: 1.5px` (`:8976`), removed at ≤640px (`:9352`); `.sf-rail-count` — `margin-left: auto` (`:9009`)

*Dropdowns, popovers, modals*
- `.user-menu-panel` — `right: 0` (`:672`), `right: -8px` at mobile (`:4046`)
- `.artist-switcher-panel` — `left: 50%; transform: translateX(-50%)` (`:1286-1287`), overridden to `right: 0; left: auto; transform: none` at mobile (`:3981`)
- `.artist-dots-menu` (`:1373`), `.filter-drop-panel` (`:1868`), `.notif-panel` (`:6374`), `.tm-dots-dropdown` (`:6910`), `.ws-dropdown` (`:8298`) — all `right: 0`
- `.gtask-show-picker-dropdown` — `left: 0; right: 0` (`:4362`)
- `.qv-close` — `right: 14px` (`:7794`) — modal close button
- `.crew-card-actions` — `right: 10px` (`:3663`) — hover-revealed edit/delete
- `.notif-badge` — `right: 2px` (`:6356`)
- `.ws-toast` — `left: 50%; transform: translateX(-50%)` (`:8409-8410`, keyframes `:8423-8424`); same pattern in `automations.css:173-174`

*Card grid and list rows*
- `.show-card-header h2` — `padding-right: 9px; text-align: right` (`:2093`, `:2097`) — **hardcoded RTL**, see §3.2
- `.mytask-row` — `border-right`, `:nth-child(2n)` reset (`:8140`, `:8143`, `:8896`)
- `.mcal-cell` — `border-right` + `:nth-child(7n)` reset (`:7617`, `:7625`); `.mcal-week-grid` `border-left` (`:7654`); `.mcal-week-col` `border-right` (`:7658`)
- `.ev-pill` — `border-right: 2px solid var(--pill-color)` (`:7718`) + `text-align: right` (`:7724`) — the colored event pill's accent edge
- `.dash-stat` — `border-right` + `:last-child` reset (`:7392`, `:7395`)
- `.pg-bar-stat-strip` — `right: 0` (`:1736`); `.pg-bar-stat + .pg-bar-stat` — `border-left` (`:1747`)
- `.gtask-board-*` — `margin-left: auto` (`:4465`, `:4501`), `padding-left: 24px` (`:4494`), mobile block (`:4530-4531`)

*Form rows and controls*
- `.settings-toggle-thumb` — `left: 3px` + `translateX(24px)` when on (`:833`, `:842`)
- `.nset-toggle-knob` — `left: 3px` + `translateX(20px)` when on (`:10405`, `:10408`)
- `.seg-btn` — `border-left` + `:first-child` reset (`:523`, `:535`)
- `.filter-btn` — `border-right` + `:last-child` reset (`:1969`, `:1981`), dark override (`:1980`)
- `.slc-format-seg--dash` — `border-left` + `border-right` (`:5574`)
- `.slc-show-select` — `padding-right: 28px` (`:5623`) — caret clearance
- `.slc-manual-input` — `text-align: right` (`:5730`)
- `.team-table th` (`:4639`), `.settings-table th` (`:5124`), `.slc-th` (`:5694`) — `text-align: left`
- `.tm-perm-matrix-cell-col` (`:7190`), `.tm-perm-cell` (`:7226`), `.tm-settings-col + .tm-settings-col` (`:7264`) — `border-left`
- `.tg-rubric-row` — `padding-left: 24px` (`:5947`), reset at ≤640px (`:6126`)

*Progress bar* — **✓ clean.** `.show-progress` / `-track` / `-fill` (`App.css:2207-2225`)
use flex plus a percentage `width`, no physical properties. Under `dir="rtl"` the fill
correctly grows from the inline-start edge with no change. This is the one
layout-critical component that needs nothing.

**Cosmetic (~69 declarations).** Micro-spacing on badges, pills, and inline
separators. Wrong-side under RTL but not disorienting:
`.tlog-pill-hours` `:591`, `.ust-2fa-badge` `:1017`, `.tag` `:2148`, `.badge` `:2627`,
`.task-type-badge` `:2977`, `.slc-dur--manual` `:5727`, `.tg-check-email` `:5938`,
`.btn-perm-toggle` `:6041`, `.mcal-more` `:7646`, `.ev-pill-time` `:7740`,
`.ws-trigger-caret` `:8292`, `.dash-filter-eyebrow` `:8514`, `.tlog-filter-eyebrow` `:9470`,
`.tlog-footer-unit` `:9708`, `.sf-guest-count` `:9224`, `.adm-tab-count` `:10502`,
`.adm-detail-fact::after` `:10589`, `.tools-nav-caret` `:5379`, `.rc-cfg-path-note`
(automations.css:103), `.bldr-preview-label` (automations.css:142), and similar.

*Marquee animations* — `@keyframes marquee` (`:1651-1652`) and `@keyframes dash-marquee`
(`:8476-8477`) use `translateX(0) → translateX(-50%)`. Under RTL these scroll the
wrong way. Cosmetic, but visible.

### 1.4 Inline styles in JSX

Only **one** physical inline style in the entire component tree:

- `components/ShowCard.jsx:269` — `marginLeft: i > 0 ? -4 : 0` on `.meta-crew-avatar`,
  the overlapping-avatar stack. Under RTL the avatars overlap the wrong direction.

(`components/TaskManager.jsx:230` has `useState({ top: 0, left: 0 })`, but that is
computed dropdown positioning state, not a static style.)

---

## 2. Hardcoded user-facing strings

**~1,029 English strings.** No i18n library is installed — no `react-i18next`,
`react-intl`, `lingui`, or message catalog anywhere in the tree.

### 2.1 Per-file counts, descending

| # | File | Total | JSX text | attrs | msgs | inline |
|---:|---|---:|---:|---:|---:|---:|
| 1 | `App.jsx` | **154** | 64 | 19 | 11 | 60 |
| 2 | `components/TeamPanel.jsx` | **74** | 42 | 8 | 1 | 23 |
| 3 | `components/automations/AutomationBuilder.jsx` | **63** | 24 | 11 | 0 | 28 |
| 4 | `components/CrewManager.jsx` | **61** | 29 | 11 | 0 | 21 |
| 5 | `components/ShowCard.jsx` | **61** | 27 | 10 | 0 | 24 |
| 6 | `components/ShowForm.jsx` | **52** | 25 | 15 | 0 | 12 |
| 7 | `components/SettingsPanel.jsx` | **51** | 39 | 0 | 3 | 9 |
| 8 | `components/TimeLog.jsx` | **48** | 26 | 4 | 2 | 16 |
| 9 | `components/automations/RecipeCards.jsx` | **43** | 27 | 8 | 0 | 8 |
| 10 | `components/Dashboard.jsx` | **43** | 20 | 6 | 0 | 17 |
| 11 | `components/SetlistCalculator.jsx` | **41** | 25 | 8 | 2 | 6 |
| 12 | `components/GlobalTaskPanel.jsx` | **41** | 24 | 12 | 0 | 5 |
| 13 | `components/NotificationSettingsScreen.jsx` | **30** | 26 | 1 | 1 | 2 |
| 14 | `components/admin/ProjectForm.jsx` | **29** | 16 | 6 | 2 | 5 |
| 15 | `components/TechnicalManager.jsx` | **24** | 13 | 9 | 0 | 2 |
| 16 | `components/admin/ProjectDetail.jsx` | **23** | 20 | 1 | 0 | 2 |
| 17 | `components/TaskManager.jsx` | **22** | 13 | 5 | 0 | 4 |
| 18 | `components/admin/ClientForm.jsx` | **19** | 10 | 4 | 1 | 4 |
| 19 | `components/ShowList.jsx` | **19** | 10 | 3 | 0 | 6 |
| 20 | `components/backliner/BacklinerDashboard.jsx` | **14** | 9 | 1 | 0 | 4 |
| 21 | `components/TechSpecParser.jsx` | **13** | 11 | 2 | 0 | 0 |
| 22 | `components/TeamsPage.jsx` | **13** | 10 | 1 | 1 | 1 |
| 23 | `config/workspaceTypes.js` | **13** | 0 | 0 | 0 | 13 |
| 24 | `components/automations/AutomationsPage.jsx` | **11** | 6 | 1 | 0 | 4 |
| 25 | `components/automations/IntegrationsBar.jsx` | **11** | 4 | 0 | 5 | 2 |
| 26 | `components/admin/ProjectsPage.jsx` | **10** | 8 | 1 | 0 | 1 |
| 27 | `components/backliner/TechFiles.jsx` | **9** | 3 | 2 | 0 | 4 |
| 28 | `components/backliner/BacklineChecklist.jsx` | **7** | 3 | 2 | 0 | 2 |
| 29 | `components/backliner/TechnicalSetlist.jsx` | **6** | 2 | 4 | 0 | 0 |
| 30 | `components/automations/AutomationList.jsx` | **6** | 2 | 1 | 1 | 2 |
| 31 | `components/admin/ClientsPage.jsx` | **4** | 2 | 1 | 0 | 1 |
| 32 | `components/ConfirmModal.jsx` | **4** | 0 | 0 | 0 | 4 |
| 33 | `components/admin/adminFormat.js` | **3** | 0 | 0 | 0 | 3 |
| 34 | `components/ShowBacklinePanel.jsx` | **3** | 0 | 0 | 0 | 3 |
| 35 | `components/DemoBanner.jsx` | **2** | 2 | 0 | 0 | 0 |
| 36 | `components/ui/SavedPill.jsx` | **1** | 1 | 0 | 0 | 0 |
| 37 | `components/ui/ErrorBoundary.jsx` | **1** | 1 | 0 | 0 | 0 |
| | **TOTAL** | **1,029** | | | | |

Column meanings: **JSX text** = literal text nodes between tags · **attrs** =
`placeholder` / `title` / `aria-label` / `alt` · **msgs** = `setErr`/`setError`/
`setMsg`/`toast`/`alert` arguments and `new Error(...)` · **inline** = string
literals in JSX ternaries, label-config objects (`{ key, label }`), and component
prop defaults.

Six files with **0** user-facing strings — genuinely presentational, safe to ignore:
`ui/Button.jsx`, `ui/IconButton.jsx`, `ui/FilterChip.jsx`, `ui/MetricBox.jsx`,
`ui/SegmentedControl.jsx`, `ui/PageBar.jsx`.

### 2.2 Where the mass is

- **Top 5 files = 413 strings (40%)**
- **Top 12 files = 692 strings (67%)**
- Remaining 25 files = 337 strings (33%)

`App.jsx` alone is 15% of the total, concentrated in three places: the nav/page
router (`:672-1049`), the `UserSettingsModal` (`:1670-2270`), and the 21-entry
`TIMEZONES` array (`:1646-1667`). That array is a self-contained block — the
cheapest 21 strings in the codebase to externalize.

`config/workspaceTypes.js` is the highest-leverage file by ratio: 13 strings, all of
them `label:` values in a config array (`:20-56`), and they drive the entire primary
navigation. Every nav item in the app reads from it.

`automations/AutomationBuilder.jsx` is 63 strings in a 346-line file, almost entirely
five `label:` config arrays at the top (`:4-36`) — trigger types, action types, field
names, and comparison operators. Contiguous, no JSX interleaving.

### 2.3 Hardcoded Hebrew — 15 strings

Hebrew is already hardcoded in the client, which means the app has *two* untranslated
languages, not one:

| File:line | String | Kind |
|---|---|---|
| `App.jsx:1083` | `תיאור חסר` | validation error |
| `App.jsx:1084` | `שעות חייבות להיות > 0` | validation error |
| `Dashboard.jsx:188` | `הוסף משימה...` | placeholder |
| `Dashboard.jsx:255` | `רשימת מוזמנים` | JSX text |
| `Dashboard.jsx:280` | `Sort the guest list alphabetically (א–ב)` | title attr, mixed |
| `Dashboard.jsx:281` | `Sort א–ב` | button label, mixed |
| `Dashboard.jsx:292` | `שם מוזמן\nשם מוזמן נוסף` | placeholder |
| `Dashboard.jsx:492` | `Schedule · לו״ז` | JSX text, mixed |
| `ShowCard.jsx:352,363,373,383` | `פסנתר`, `מראת גוף`, `פינת קפה`, `בקבוקי מים` | checkbox labels |
| `TaskManager.jsx:442,443` | `Sort the guest list alphabetically (א–ב)`, `Sort א–ב` | title + label, mixed |
| `admin/ClientForm.jsx:82` | `ח.פ. / ע.מ.` | field label |

Four of these are **mixed-script single strings** (`Sort א–ב`, `Schedule · לו״ז`).
Those cannot be handled by direction alone — they need to become two separately
localized strings, or the bidi resolution inside them will stay unpredictable.

Also relevant: `ShowCard.jsx:352` compares against a hardcoded Hebrew event type —
`show.eventType === 'אני גיטרה'`. That is business logic keyed on a display string.
`App.css:1546-1560` similarly maps `data-et-idx` values to Hebrew event-type names in
comments. Neither breaks under RTL, but both will break under translation.

---

## 3. Existing dir / RTL handling

There is substantially more here than a typical pre-i18n codebase.

### 3.1 Document-level — ⚠ contradictory

`client/index.html:1`:

```html
<html lang="he" dir="ltr">
```

The document declares Hebrew content and then forces left-to-right. This is
self-contradictory and is a live bug independent of any RTL work:

- Any text that is *not* wrapped in `dir="auto"` inherits LTR while claiming `lang="he"`
- Punctuation at the end of a Hebrew sentence lands on the wrong side
- The `[dir="auto"]:lang(he)` font rule (see §3.3) matches on `lang`, so Hebrew content
  gets Hebrew fonts but LTR layout

Nothing in the client ever writes `document.documentElement.dir` or `.lang`. The value
is a hardcoded constant. By contrast, `theme` *is* synced to the DOM at
`App.jsx:70-74` via `document.documentElement.setAttribute('data-theme', theme)` —
so the mechanism exists and is proven; `dir` simply was never wired into it.

### 3.2 The one hardcoded-RTL rule

`App.css:2093-2097`, `.show-card-header h2`:

```css
padding-right: 9px;
text-align: right;
```

with a comment explaining the intent: right-align the show name, let the element's
`dir` attribute handle bidi, and explicitly *do not* use `unicode-bidi: bidi-override`.
The reasoning is correct. But `text-align: right` here is a hardcoded assumption that
content is Hebrew — under an actual LTR locale the show title would sit on the wrong
side. This is the only rule in the codebase that assumes RTL rather than LTR.

### 3.3 CSS with `[dir]` selectors — 3 rules

| Location | Rule |
|---|---|
| `App.css:162-167` | `[dir="rtl"], [dir="auto"]:lang(he)` → Hebrew font stack (Assistant, Heebo), `letter-spacing: 0`, `font-feature-settings: "kern" 1` |
| `App.css:2103-2105` | `[dir="auto"]:lang(he), [dir="rtl"]` → **empty rule body**, only a comment (`/* Hebrew sits a touch differently */`). Dead code. |
| `App.css:2107-2111` | `.show-card-header h2:lang(he)` → Rubik font override |

### 3.4 Bidi utility classes — `App.css:10469-10481`

Two documented utilities, both well-designed:

```css
.he { text-align: start; }
table .he { text-align: left; }
.n { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: embed; display: inline-block; }
```

`.he` is alignment-only and paired with `dir="auto"` by contract (stated in the
comment). `.n` isolates numbers/dates/currency as LTR runs inside RTL text — this is
the correct `unicode-bidi: embed` usage.

`.n` and `direction: ltr` at `App.css:10480` are the codebase's **only** occurrences of
`direction:` and `unicode-bidi:` outside comments. `.he` is used at 6 JSX sites, all in
`components/admin/` (`ProjectsPage.jsx:52,56`, `ProjectDetail.jsx:107`,
`ClientsPage.jsx:42,51`).

### 3.5 `dir` attributes in JSX — ~190 sites

| Value | Count | Where |
|---|---:|---|
| `dir="auto"` | ~178 | Across 24 component files |
| `dir="ltr"` | 12 | `RecipeCards.jsx` ×10 (code/config previews), `TaskManager.jsx` ×3, `admin/ProjectForm.jsx` ×2 (`rate`, `vatPercent`) |
| `dir="rtl"` | 0 | — |

Coverage by file (`dir="auto"` sites): `ShowForm.jsx` 16, `CrewManager.jsx` 16,
`Dashboard.jsx` 14, `GlobalTaskPanel.jsx` 11, `TechnicalManager.jsx` 8,
`ShowCard.jsx` 8, `admin/ClientForm.jsx` 7, `TeamPanel.jsx` 7, `TeamsPage.jsx` 6,
`admin/ProjectForm.jsx` 5, `admin/ProjectsPage.jsx` 4, `TaskManager.jsx` 3,
`admin/ProjectDetail.jsx` 3, `backliner/BacklinerDashboard.jsx` 3, others 1-2 each.

### 3.6 In-code documentation of bidi reasoning

Four components carry comments showing the bidi behavior was reasoned about, not
copy-pasted. Worth reading before changing anything in these files:

- `components/admin/ProjectsPage.jsx:11,30-32` — explains why a compound line
  ("client · N days") is split into **per-part** `dir="auto"` spans rather than one:
  a single `dir="auto"` run resolves off the first strong character and reorders the
  whole string.
- `components/admin/ProjectDetail.jsx:88` — same reasoning for mixed Hebrew/English runs.
- `components/admin/ClientForm.jsx:11` — inputs carry `dir="auto"` so direction follows
  the entered value, not the app.
- `components/ShowCard.jsx:253-256` — `lang` drives the font, `dir="auto"` drives direction.

### 3.7 Server-side

- `server/routes/shows.js:862` — generated coordination-sheet HTML is
  `<html lang="he" dir="rtl">`. **The server's own output is RTL while the client is LTR.**
- Timezone is hardcoded `Asia/Jerusalem` in three places:
  `server/routes/notifications.js:75,360`, `server/routes/automations.js:648`,
  `server/utils/adminValidate.js:195`.

---

## 4. Raw user-data render sites

The pattern is already established: **178 sites carry `dir="auto"`**. What follows is
the gap — sites rendering user-supplied values *without* it.

### 4.1 Already covered — ✓ no action

These are the high-traffic paths, and they are done:

| Field | Coverage |
|---|---|
| Show name | `ShowCard.jsx:256`, `Dashboard.jsx:383,442,479,653`, `TeamPanel.jsx:340,756,822`, `TeamsPage.jsx:59`, `ShowForm.jsx:272,322`, `backliner/BacklinerDashboard.jsx:119` |
| Venue | `ShowCard.jsx:259`, `Dashboard.jsx:387,485,657`, `TeamPanel.jsx:343`, `ShowForm.jsx:337` |
| Address | `Dashboard.jsx:486`, `ShowForm.jsx:341`, `ShowCard.jsx` via `Field` |
| Notes | `ShowForm.jsx:445`, `CrewManager.jsx:295,826`, `ShowCard.jsx:454`, `admin/ClientForm.jsx:126`, `admin/ProjectForm.jsx:263`, `admin/ProjectDetail.jsx:62` |
| Contacts | `ShowCard.jsx` via `Field` (`:293` → `:549`) |
| Schedule | `ShowCard.jsx:333` (`<pre dir="auto">`), `Dashboard.jsx:497`, `ShowForm.jsx:377` |
| Technical crew | `ShowCard.jsx` via `Field` (`:290` → `:549`) |
| Guest list | `Dashboard.jsx:290,294`, `TaskManager.jsx:451`, `ShowForm.jsx:461,468` |
| Crew name/phone/email (forms) | `CrewManager.jsx:770,798,803` |
| Task text | `GlobalTaskPanel.jsx:518,603`, `Dashboard.jsx:715`, `TeamPanel.jsx:300`, `TimeLog.jsx:86` |
| Custom fields | `ShowForm.jsx:525,527,533`, `ShowCard.jsx:440`, `CrewManager.jsx:600,627,650` |

**`ShowCard.jsx`'s `Field` component (`:534-553`) applies `dir="auto"` centrally at
`:549`** — so every `<Field>` call site inherits correct bidi. That is the right
architecture and worth replicating.

### 4.2 Missing `dir` — ~55 sites

Grouped by what they need.

#### Needs `dir="auto"` — free-form names and text

*Artist / workspace names*
- `App.jsx:1151` — `<option>{a.name}</option>`
- `App.jsx:1228` — `.artist-switcher-label` `{label}`
- `App.jsx:1240` — `{a.name}` artist option row
- `App.jsx:1320` — `currentArtist?.name`
- `App.jsx:1380` — `.ws-dropdown-item-name` `{a.name}`
- `Dashboard.jsx:476` — `{artist.name}` (quick-view header)
- `Dashboard.jsx:650` — `{artist.name}` (up-next)
- `Dashboard.jsx:899` — `{a.name} {a.count}`
- `SettingsPanel.jsx:255` — `<th key={a.id}>{a.name}</th>` (artist-access matrix)
- `TimeLog.jsx:38` — `{a.name}` in `ArtistTag`

*Show names in selects and pills*
- `GlobalTaskPanel.jsx:69` — `{s.name}`
- `GlobalTaskPanel.jsx:244` — `.gtask-pill--show` `{s.name}`
- `GlobalTaskPanel.jsx:610` — `{s.name}`
- `TeamPanel.jsx:313` — `<option>{s.name}</option>`
- `SetlistCalculator.jsx:249` — `.slc-saved-show` `{linked.name}`
- `SetlistCalculator.jsx:354` — `<option>{s.name}{s.date}</option>`
- `SetlistCalculator.jsx:412` — `Linked: {linkedShow.name}`
- `TechSpecParser.jsx:180` — `{s.name}`
- `backliner/BacklinerDashboard.jsx:26` — `.bk-show-name` `{show.name}`
- `backliner/BacklinerDashboard.jsx:28` — `{show.venue}`
- `backliner/BacklinerDashboard.jsx:92` — `<option>{s.name}</option>`

*Crew names and roles*
- `CrewManager.jsx:240` — `.crew-group-label` `{role}` (user-defined role name)
- `CrewManager.jsx:252` — `{initialsFor(m.name)}` in avatar
- `CrewManager.jsx:262` — `{ROLE_DISPLAY[role] || role}` — falls through to raw user value
- `ShowCard.jsx:270` — `{initialsFor(m.name)}` in avatar stack
- `ShowForm.jsx:507` — `{m.role} – {m.name}` — **compound**, see §4.3
- `GlobalTaskPanel.jsx:140` — `<option>{m.name}{m.role ? ` (${m.role})` : ''}</option>` — **compound**
- `GlobalTaskPanel.jsx:480` — same pattern

*Event types, setlists, checklists, files*
- `ShowForm.jsx:520` — `.sf-sec-sub` `{form.eventType}`
- `SetlistCalculator.jsx:247` — `.slc-saved-name` `{sl.name}` (user-named setlist)
- `SetlistCalculator.jsx:447,450` — `{t.songName}`
- `SetlistCalculator.jsx:453` — `.slc-td--artist` `{t.artist}`
- `backliner/TechnicalSetlist.jsx:45` — `.bk-setlist-name` `{song.name}`
- `backliner/TechnicalSetlist.jsx:61` — `.bk-setlist-note` `{song.techNote}`
- `backliner/BacklineChecklist.jsx:53` — `.bk-checklist-text` `{item.text}`
- `ShowForm.jsx:567,594` — `{form.customFields[def.id].name}` (uploaded filename)
- `TechnicalManager.jsx:146` — `{specFile.name}` (uploaded filename)
- `automations/AutomationList.jsx:65` — `<strong>{auto.label}</strong>` (user-named automation)

*Derived / message text containing user data*
- `App.jsx:1626` — `.notif-item-text` `{n.text}` — interpolates show names
- `TeamPanel.jsx:638` — `{reqMsg.text}`
- `admin/ClientsPage.jsx` / `admin/ProjectForm.jsx:165` — `<option>{c.name}</option>` (client name)
- `TaskManager.jsx:387` — `<option>{c.name}{c.primary ? ' ★' : ''}</option>` (calendar name)
- `ui/PageBar.jsx:45` — `{title}` — receives artist-derived page titles from callers

*Attribute carrying user text*
- `GlobalTaskPanel.jsx:619` — `title={t.notes}` — tooltip with free-form user notes

#### Needs `dir="ltr"` — structurally LTR data

Phone numbers and emails must not be bidi-resolved; `dir="auto"` is wrong for them
(a leading `+` or digit gives no strong direction, so they inherit the surrounding
paragraph and render with the sign or TLD on the wrong side):

- `CrewManager.jsx:273` — `<a href={`tel:${m.phone}`}>{m.phone}</a>`
- `CrewManager.jsx:279` — `<a href={`mailto:${m.email}`}>{m.email}</a>`
- `TeamPanel.jsx:454` — `{u.email || 'No email — click to add'}` (compound: user data + English fallback)
- `TeamPanel.jsx:809` — `.bkp-email` `{user.email}`

The existing `.n` utility (`App.css:10478-10481`) already implements exactly this
isolation and should be reused rather than adding raw `dir="ltr"`.

Note the inconsistency: `CrewManager.jsx:798,803` puts `dir="auto"` on the phone and
email *inputs*, while the *display* of those same values (`:273`, `:279`) has no `dir`
at all. Neither is `ltr`.

### 4.3 Compound strings — the subtle cases

Six sites concatenate user data with literal separators inside a single element:

| Site | Expression |
|---|---|
| `ShowForm.jsx:507` | `{m.role} – {m.name}` |
| `GlobalTaskPanel.jsx:140,480` | `{m.name}{m.role ? ` (${m.role})` : ''}` |
| `SetlistCalculator.jsx:354` | `{s.name}{s.date ? ` · ${s.date}` : ''}` |
| `backliner/BacklinerDashboard.jsx:28` | `{fmtDate(show.date)}{show.venue ? ` · ${show.venue}` : ''}` |
| `Dashboard.jsx:899` | `{a.name} {a.count}` |
| `CrewManager.jsx:546` | `{m.role} – {m.name}` (has `dir="auto"` — still compound) |

Adding a single `dir="auto"` to these **will not fix them and may make them worse**:
the whole run resolves off the first strong character, so a Hebrew name followed by an
English role reorders the separator and the parenthesis. `ProjectsPage.jsx:30-32`
already documents this exact failure and solves it by giving each part its own
`dir="auto"` span. These six need the same treatment.

---

## 5. User preference state

### 5.1 Client-side storage — device-local only

Four `localStorage` keys, no client-side settings object:

| Key | Written at | Purpose |
|---|---|---|
| `ph-theme` | `App.jsx:40,73` | `'light'` \| `'dark'` |
| `ph-seen-notifs` | `App.jsx:1548,1583` | dismissed notification IDs |
| *(per-show collapse key)* | `Dashboard.jsx:307,339` | card collapse state |
| *(per-show `lsKey`)* | `Dashboard.jsx:313,328` | dashboard panel state |

**Theme is device-local and not synced to the server.** It is read once into React
state at `App.jsx:40` and written back on change at `:73`, alongside
`document.documentElement.setAttribute('data-theme', theme)` at `:72`.

### 5.2 Server-side per-user profile — ✓ this exists and is extensible

**Answer to the question: yes, there is a per-user settings object, and it already
holds timezone.**

`GET /api/me` (`server/index.js:645-666`) returns:

```js
{ userId, username, role, workspaceRole, displayName, timezone, avatarUrl }
```

`PATCH /api/me` (`server/index.js:670-694`) accepts `{ workspaceRole, displayName, timezone }`.

Storage is split by role:
- **admin** → `server/data/admin-profile.json` (currently `{ "timezone": "Asia/Jerusalem" }`)
- **non-admin** → the user record in `server/data/users.json`

Current user record shape (`server/data/users.json`):

```json
{ "id": "...", "username": "test", "passwordHash": "...", "role": "user",
  "workspaceRole": "backliner", "artistId": "...", "createdAt": "..." }
```

`displayName`, `timezone`, and `avatarExt` are written lazily by `PATCH /api/me` and
are absent until first set.

**Client-side consumer:** `UserSettingsModal` in `App.jsx:1670-2270`.
- Loads via `fetch('/api/me')` at `:1728-1736`
- Saves timezone via `PATCH /api/me` at `:1819-1823`
- Renders the timezone `<select>` at `:2141-2166` from the 21-entry `TIMEZONES`
  constant (`:1646-1667`)

This is the extension point. A `language` (or `locale`) field follows the exact
path timezone already takes — same endpoint, same modal, same storage — and would be
server-persisted and cross-device, unlike theme.

### 5.3 Other settings surfaces

- **`GET`/`PUT /api/notification-settings`** (`server/routes/notifications.js:298-310`),
  stored per-user at `notification-settings.json`. A separate object from `/api/me`,
  scoped to channels and quiet hours. Client: `NotificationSettingsScreen.jsx:38,50`.
- No locale, language, direction, or date-format preference exists anywhere,
  client or server.

### 5.4 The timezone precedent — and its warning

Timezone is stored per user but **not consumed**. All server-side scheduling is
hardcoded to `Asia/Jerusalem`:

- `server/routes/notifications.js:75` — `timeZone: 'Asia/Jerusalem'`
- `server/routes/notifications.js:360` — `cron.schedule(..., { timezone: 'Asia/Jerusalem' })`
- `server/routes/automations.js:648` — same
- `server/utils/adminValidate.js:195` — `toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })`

The preference is collected, persisted, and ignored. Worth noting before adding a
language field alongside it: the plumbing exists, but the precedent in this codebase
is that it stops at storage.

---

## 6. Assessment

### What is genuinely done

Per-value bidi resolution on user data — 178 `dir="auto"` sites, a centralized
`Field` component, documented reasoning about compound-string reordering, and correct
`unicode-bidi: embed` isolation for numerics. This is the part that requires judgment
and is normally done badly. It was done well.

### What is not started

1. **Direction is not a variable.** `dir` is a literal in `index.html`. No state, no
   toggle, no DOM sync — despite `data-theme` proving the mechanism at `App.jsx:70-74`.
2. **164 physical CSS declarations**, ~95 of them layout-critical, against 3 real
   logical properties.
3. **1,029 English + 15 Hebrew strings**, no i18n library, no catalog.

### Sizing

| Workstream | Volume | Character |
|---|---|---|
| Wire `dir` to state + `/api/me` | ~5 sites | Small, unblocks everything else |
| Fix `index.html` `lang`/`dir` contradiction | 1 line | Trivial; live bug today |
| Physical → logical CSS | 164 declarations | Mechanical, ~95 need visual verification |
| Fill `dir` gaps on user data | ~55 sites | Mechanical |
| Fix 6 compound strings | 6 sites | Requires care — pattern documented in `ProjectsPage.jsx` |
| Externalize strings | 1,044 | Volume; 67% concentrated in 12 files |

Three items are disproportionately cheap relative to impact:
`config/workspaceTypes.js` (13 strings, drives all navigation),
`AutomationBuilder.jsx:4-36` (five contiguous config arrays, 63 strings),
`App.jsx:1646-1667` (the 21-entry `TIMEZONES` array).

### The one thing to check first

`.show-card-header h2` (`App.css:2093-2097`) hardcodes `text-align: right` — the only
rule in the codebase that assumes RTL. Under a genuine LTR locale, show titles will
align wrong. It needs `text-align: start` alongside the `dir="auto"` that is already
on the element at `ShowCard.jsx:256`.

---

*Static analysis. Counts for §2 are heuristic — regex-based extraction with
code-fragment and CSS-class filtering — and are accurate to roughly ±5%. All
`file:line` references in §1, §3, §4, and §5 were read and verified directly.*

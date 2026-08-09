# Workflow traces

How three core flows actually behave end to end, traced through the code
rather than from intent. Written for planning conversations: the useful part
is usually the gap between what the flow looks like it does and what it does.

Snapshot as of commit `424a77c` (2026-08-09). Companion docs: `data-model.md`,
`api-surface.md`.

## 1. Crew assignment

### There is no availability logic

**The system does not determine who is available.** It shows the whole crew
list and records what the user taps.

- No `freebusy` call exists anywhere — Google's availability API is never used.
  `calendar.js` only calls `events.list` and `events.patch`.
- Nothing compares assignments across shows. `crewIds` is never read to detect
  the same person on two shows with the same `date`.

A crew member can be booked twice on the same night and nothing notices. Treat
any "availability" feature as greenfield, not as fixing something.

### The flow

1. `App.jsx` loads `GET /api/crew` into top-level state.
2. `crew.js GET /` returns `crew.json` verbatim — no filtering, no date awareness.
3. `ShowForm.jsx` groups **every** member by role into toggle chips. No one is
   filtered or greyed out.
4. `toggleCrew(id)` adds/removes from `form.crewIds`. That is the whole
   mechanism.
5. Choosing an event type **overwrites** `crewIds` wholesale from
   `templates.json` — a saved per-event-type roster, not an availability
   result. Manual selections made beforehand are lost.
6. `PUT /api/shows/:id` shallow-merges and writes `shows.json`.

### What the calendar router actually does

It runs *after* assignment and only pushes outward:

- `POST /api/calendar/invite/:showId` — maps `crewIds` → emails, finds an
  existing event by title (exact → substring → ≥2 shared words, ±1 day) and
  **patches attendees onto it** with `sendUpdates: 'all'`. Never creates
  events; no match returns 404. `?test=1` sends to one address only.
- `POST /api/calendar/insert-show-event` — writes `show.schedule` into a
  matched timed event's description. No invites, no attendee changes.

The `events.list` call is title-matching to locate a patch target — not a
busy check.

## 2. Coordination sheet and Brief

**Two separate outputs, two routes, different field sets, different delivery.**
Both triggered from `ShowCard`.

### 2a. PDF — `POST /api/shows/:id/pdf`

Reads `shows.json`, `crew.json`, `field-templates.json`; resolves `crewIds`;
builds RTL HTML inline in the route; renders through `server/pdf.js`
(cached puppeteer-core browser, Heebo embedded as base64 `@font-face`).

Field visibility runs through `showFieldInPdf`, which **defaults opposite ways**:
normal keys are shown unless `pdfFields[key] === false`; `check_*` keys are
hidden unless `=== true`.

What appears: name, date, event type (never gated); venue, address, parking,
transportation, contacts (gated, non-empty only); technical crew (derived from
`crewIds`, non-musicians, falling back to the stored `technicalCrew` string);
musicians (assigned musicians, names only); a composed food line
(`foodContactName || food` · phone · time); schedule; additional details;
notes; check items (piano only for one event type, mirror, coffee corner,
water bottles); custom fields from `field-templates.json` — text opt-in,
images opt-out, embedded PDFs rasterised to PNG with a `📎 filename` fallback.

Not on the PDF: `sound`, `lighting`, `backline`, `crewEmails`, `budget`,
`guestList`, rental fields.

**Delivery: download only.** Streamed as an attachment and saved via a
synthetic `a.click()`. On a Mac (`PDF_DIR` set) a copy is also written to disk
best-effort — that write is `.catch(() => {})`, so failure is silent. Nothing
is emailed; nothing goes to Drive.

### 2b. Brief — `POST /api/shows/:id/brief`

Returns a `jobId` immediately, works in a background IIFE, client polls
`GET /api/shows/:id/brief/:jobId`. Fills `brief-template.docx` via `adm-zip`
(with `mergeRunsInXml` to repair Word-split placeholders), drops sections whose
value is empty, uploads to Drive as a Google Doc, moves it into the `הפקות`
folder. Jobs live in an in-memory `Map`, cleaned after 10 minutes.

**The Brief renders only 10 fields.** The template has exactly ten
placeholders: event name, date, venue, address, technical crew (spelled
`{{TECHNICA_CREW}}` in both template and code), transportation, parking,
schedule, contacts, additional details.

**`basePayload` computes 19 fields, so 9 are dead** — `musicians`, `food`,
`notes`, `sound`, `lighting`, `backline`, `crewEmails`, `customFields` and
`checkItems` are all built, passed in, and never rendered because no
placeholder exists for them. The Brief is silently much thinner than the PDF.

Open question: is the template missing placeholders it was meant to have, or
should that computation be deleted? The code does not answer this.

**Delivery: a Drive link, not delivery.** The doc is created in the account's
own Drive and the URL is returned to the originating browser. `utils/email.js`
is required only by `backup.js` and `notifications.js` — **the brief is never
emailed**, and no sharing permissions are set, so crew have no access unless
the folder is already shared out of band.

UI caveat: the button shows `Sent ✓` plus an `Open doc →` link, but both are
cleared by a hard 15-second timer that also suppresses later poll results — so
on a slow Drive round-trip the link can be produced and never shown. "Sent" is
cosmetic; nothing was sent anywhere.

## 3. Task lifecycle

**`tasks.json` is authoritative.** Since commit `a3b8644` this is no longer
ambiguous.

Create/update/delete go through `tasks.js` (`POST` assigns a UUID, trims
`text`, normalises `showId`/`showIds`, stamps `createdAt`; `PUT` merges
`{...prev, ...req.body}`). `notifyAssigned` fires fire-and-forget on create and
on any `assigneeId` change — `.catch(() => {})`, so a notification failure is
invisible.

`TeamPanel` previously wrote tasks into `shows[].tasks` while reading from
`tasks.json`, falling back to embedded tasks only when the global array was
empty — and that check was global, not per-user. One task created anywhere made
every embedded task vanish from the panel, including ones it had just created.
It now creates and completes through the same store it reads from.

Downstream, only `tasks.json` counts: `collectSources` in `notifications.js`
reads `tasks.json` per user and per artist scope and nothing else, so digests,
reminders and overdue alerts have never fired for embedded tasks.

See `data-model.md` for what remains of `shows[].tasks` and the pending
cleanup.

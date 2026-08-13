# Data model

Planning reference for the JSON entities under `DATA_DIR`. Written to be safe
to paste into a planning context: **every personal value is replaced with a
placeholder.** For real shapes with real-looking values, use
`server/data/demo.json` — it is a synthetic fixture with the same structure and
no real people in it.

Snapshot as of commit `424a77c` (2026-08-09). Re-generate when the shapes
drift; see `workflows.md` and `api-surface.md` for the companion docs.

There is no database and no schema enforcement. `POST /api/crew` stores
`{ id, ...req.body }` and `PUT /api/tasks/:id` stores `{ ...prev, ...req.body }`,
so **the shape on disk is whatever the client last sent**. Everything below
describes current data, not a guarantee.

## `crew.json`

```json
{
  "id": "<UUID>",
  "name": "<CREW_NAME>",
  "role": "Production",
  "phone": "<CREW_PHONE>",
  "email": "<CREW_EMAIL>",
  "notes": "",
  "eventTypes": ["<EVENT_TYPE>", "<EVENT_TYPE>"]
}
```

- `id` — *string (UUID v4)* — server-generated; what `shows[].crewIds` points at.
- `name` — *string* — also copied verbatim into `shows.json`.
- `role` — *string* — free text, no enum enforced. See the vocabulary problem below.
- `phone` — *string* — string to preserve the leading zero.
- `email` — *string* — `""` when unknown; never `null`, never absent.
- `notes` — *string* — present on all records, empty on all of them.
- `eventTypes` — *array of strings* — matched against `event-types.json`
  **by value, not by id**.

There is no rate, fee, or pricing field on crew — not in the data and not in
the code.

## `tasks.json`

```json
{
  "id": "<UUID>",
  "text": "<TASK_TEXT>",
  "notes": null,
  "completed": false,
  "showId": null,
  "showIds": [],
  "dueDate": null,
  "dueTime": null,
  "assignedTo": null,
  "assigneeId": null,
  "assigneeName": null,
  "productionProjectId": null,
  "reminder": null,
  "createdAt": "<ISO_8601>",
  "pushNotifiedAt": null
}
```

- `text` — the only required field on create (trimmed; 400 if blank).
- `showId` / `showIds` — the same relationship in two encodings. The route
  keeps `showId = showIds[0]` and its own comment calls it legacy.
- `assignedTo` — legacy free-text assignee, superseded by `assigneeId` +
  `assigneeName`.
- `assigneeId` — drives `notifyAssigned` on create and on reassignment.
- `productionProjectId` — optional link to one Production Project in the same
  artist-scoped directory. It is changed only through Production Project task
  endpoints; generic task CRUD cannot set it. `null` means unassociated.
- `dueTime` and `reminder` — written on every create, but **absent from every
  task currently on disk**; all stored tasks predate the fields.
- `pushNotifiedAt` — push dedupe marker.

## `production-projects.json`

Artist-scoped Production Projects are deliberately separate from the
Administration-only `projects.json` model. Every record lives in the selected
artist's data directory; it does not carry an `artistId` of its own.

```json
{
  "id": "<UUID>",
  "name": "<PROJECT_NAME>",
  "deadline": "2026-12-31",
  "status": "in_progress",
  "teamMemberIds": ["<USER_ID>"],
  "milestones": [
    {
      "id": "<UUID>",
      "title": "<MILESTONE_TITLE>",
      "completed": false,
      "completedAt": null,
      "createdAt": "<ISO_8601>"
    }
  ],
  "communicationLog": [
    {
      "id": "<UUID>",
      "occurredAt": "<ISO_8601>",
      "note": "<FREE_TEXT_NOTE>",
      "authorId": "<USER_ID>",
      "authorNameSnapshot": "<USER_NAME>",
      "createdAt": "<ISO_8601>"
    }
  ],
  "createdAt": "<ISO_8601>",
  "updatedAt": "<ISO_8601>"
}
```

- `status` is one of `planned`, `in_progress`, `on_hold`, `completed`, or
  `cancelled`.
- Progress is not stored. Reads derive `milestoneTotal`,
  `completedMilestoneCount`, and `progressPercent`; `progressPercent` is
  `null` when there are no milestones.
- `isOverdue` is derived when a non-terminal project has a deadline before
  today.
- `teamMemberIds` references authenticated users who currently have access to
  this same artist workspace. It never references `crew.json` records. Missing
  on older records is read as `[]`.
- The communication log is returned newest-first by `occurredAt`; author
  snapshots are retained when an entry is edited or a team member is removed.
- Associated tasks remain canonical records in the artist's `tasks.json`; the
  project does not duplicate task ids. Deleting the project clears matching
  `tasks[].productionProjectId` values and preserves the task records.
- Project team members may read the project and append communication entries.
  Only the workspace owner/admin may change project structure, milestones,
  team membership, communication history, or task associations.

## `shows.json` — the crew-related fields

Full show records are large; these are the fields that matter for planning
because they overlap with `crew.json`:

- `crewIds` — *array of UUIDs* — the authoritative assignment.
- `technicalCrew` — *string* — a rendered `"role – name | role – name"` line.
- `sound` / `lighting` / `backline` — *string* — bare crew names.
- `crewEmails` — *array of strings* — copied email addresses.
- `tasks` — *array* — vestigial; see below.

## Open decisions

### Crew identity is duplicated into shows, and has already drifted

Name, role and email each live in two places. `technicalCrew`,
`sound`/`lighting`/`backline` and `crewEmails` are all derivable from
`crewIds` + `crew.json`, but they are persisted independently and nothing
re-syncs them.

This is not theoretical: **`crewEmails` and `crewIds` disagree in length on 9
of 20 shows** (in two cases 7 emails against 2 ids), and one address is stored
with different capitalisation than the `crew.json` record it came from.
Renaming a crew member or fixing their email updates `crew.json` only; every
past show keeps the stale copy.

The decision splits two ways and the fixes are opposite:

- If `crewIds` is the single source of truth → derive the other four at read
  time and stop persisting them.
- If they are deliberate historical snapshots of who actually worked a show →
  say so explicitly and stop treating them as derivable. But the length
  mismatches suggest they are not reliable snapshots either.

### `role` has three vocabularies in circulation

Stored data uses `Backliners` / `Musicians`. `CREW_ROLES` in `CrewManager.jsx`
offers `Backline` / `Musician`. `ROLE_DISPLAY` additionally maps Hebrew legacy
values (`בקליין`, `הפקה`, `תאורה`, `סאונד`, `נגן`).

Editing any member through the form silently rewrites their role to the new
spelling, so the file drifts toward a mix. Worse, the three "technical crew"
builders disagree about what to exclude:

- `ShowForm.jsx` — no filter at all.
- `POST /api/shows/apply-crew-templates` — excludes `role !== 'נגן'`, the
  Hebrew literal only, so `Musicians` slips through.
- PDF and Brief — exclude a 4-value set `{Musician, Musicians, נגן, נגנים}`.

Decide one stored vocabulary and normalise on write; keep `ROLE_DISPLAY` as a
read-side shim only.

### Three different ways to say "no value"

`crew.json` uses `""` exclusively and never `null` or absent. `tasks.json`
uses `null` on newer records and omits the key entirely on older ones. The
same concept — a `notes` field — is `""` in one file and `null` in the other.
Pick one convention per meaning and apply it to both.

Two specifics worth settling:

- `notes` on crew is empty on every record. Drop it, or confirm it is reserved.
- `eventTypes: []` has no defined meaning. **Nothing filters crew by it** —
  `CrewManager` renders the chips and `ShowForm` uses the *global* event-type
  list for the show's type dropdown, never the per-member array. So "tagged
  for nothing" and "works all types" are indistinguishable, and nothing yet
  depends on the difference. Decide before something does.

### `shows[].tasks` is vestigial but not gone

Still seeded as `[]` on show creation (`shows.js`, `import.js`, and the demo
path in `App.jsx`), but since commit `a3b8644` nothing writes real tasks into
it — `TeamPanel` now reads and writes `tasks.json`, the single authoritative
store.

One non-task entry remains wedged in a `shows[].tasks` array: a base64
stage-layout PDF (~1.28 MB, roughly half of the 2.76 MB `shows.json`), already
duplicated in that show's `customFields` where it belongs.
`POST /api/admin/cleanup-show-tasks` exists to remove it but **has not been run
yet**. After that, decide whether to stop seeding the field at all.

### Vocabulary coupling

`crew[].eventTypes` references `event-types.json` by value. All current
references match, but renaming an event type there would silently orphan every
crew reference with nothing to detect the break. Store ids, or add a rename
that rewrites references.

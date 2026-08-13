# API surface

One line per endpoint, for orienting a planning conversation. Not a contract —
request and response shapes live in the route files.

Snapshot as of commit `424a77c` (2026-08-09): 17 routers plus 61 endpoints
defined inline in `server/index.js`. Companion docs: `data-model.md`,
`workflows.md`.

Two conventions apply almost everywhere:

- **Artist scoping.** Most routes accept `?artistId=…` and build a scoped
  identity via `artistScopedId(userId, artistId)`. Paths are resolved through
  `dataPath`/`cacheKey` — never hard-coded.
- **Team-member access.** `req.teamMemberView` makes writes 403 unless the
  user's editable rubrics allow the specific fields; reads are filtered by
  `filterShowForTeamMember`.

## Domain routers (`server/routes/`)

### `shows` → `/api/shows`
| Method | Path | Note |
|---|---|---|
| GET | `/` | List; returns `slimShow()` — strips base64 and long free text |
| GET | `/:id` | Full record, used for editing, PDF and Brief |
| POST | `/` | Create; seeds `tasks: []` |
| PUT | `/:id` | Shallow merge, with a guard restoring slimmed `customFields` |
| DELETE | `/:id` | |
| POST | `/apply-crew-templates` | Bulk re-apply per-event-type crew rosters |
| POST | `/:id/brief` | Returns `{ jobId }`; work continues in background |
| GET | `/:id/brief/:jobId` | Poll brief status |
| POST | `/:id/pdf` | Renders and streams the coordination sheet |

### `crew` → `/api/crew`
`GET /` · `POST /` · `PUT /:id` · `DELETE /:id` — plain CRUD over `crew.json`.
No validation; `POST` stores `{ id, ...req.body }`.

### `tasks` → `/api/tasks`
`GET /` · `POST /` · `PUT /:id` · `DELETE /:id`. The authoritative task store.
`POST` requires non-blank `text`. Assignment changes trigger `notifyAssigned`.

For an artist-scoped shared-member request, `GET /?artistId=…` returns only
tasks assigned to that authenticated member. Generic scoped `POST`, `PUT`, and
`DELETE` are owner/admin-only. A shared member may only use
`PATCH /api/tasks/assigned/:artistId/:id` to set their own assigned task's
`completed` boolean; every other field is rejected.

`productionProjectId` is an optional task field, but generic task `POST` and
`PUT` reject attempts to set or change it. Associations are validated and
managed through the Production Project endpoints below.

### `production-projects` → `/api/production-projects`

Production-workspace-only, artist-scoped project coordination. `GET /members`
is owner-only and returns eligible team-picker records only (`id`, safe `label`,
`accessRole`), using the same current-artist grant rule as `PUT /:id/team`.
`GET /:id/team-members` returns that same minimal shape only for explicit
members of a project the requester may read; it never exposes a workspace roster
to shared members.
Requires `?artistId=…`, the existing artist-scope authorization, and a
Production workspace. Owners/admins see all projects. A shared user sees only
projects containing their authenticated id in `teamMemberIds` and may append,
but not edit or delete, communication-log entries.

`GET|POST /` · `GET|PUT|DELETE /:id` ·
`POST /:id/milestones` · `PUT|DELETE /:id/milestones/:milestoneId` ·
`POST /:id/communication-log` ·
`PUT|DELETE /:id/communication-log/:entryId` ·
`PUT /:id/team` ·
`GET|POST /:id/tasks` · `PUT|DELETE /:id/tasks/:taskId`.

Project progress and overdue state are derived on reads and are never accepted
or persisted as client input. Task create/attach/detach is owner/admin-only;
shared members may list only linked tasks assigned to them and complete those
through the boolean-only assigned-task endpoint. Attach validates the project
and task in the same artist scope and rejects an existing link to another
project. Project deletion clears associations without deleting task records.
`PUT /:id/team` is owner/admin-only and accepts `{ teamMemberIds: [...] }`;
every id must identify an authenticated user with current access to the same
artist. Removing an id never changes communication entries or author snapshots.

### `calendar` → `/api/calendar`
| Method | Path | Note |
|---|---|---|
| GET/POST | `/config` | Read or set the target calendar id |
| POST | `/invite/:showId` | Patches attendees onto an **existing** event; 404 if none |
| POST | `/insert-show-event` | Writes `schedule` into a matched timed event |

Never creates events. No availability checking — see `workflows.md`.

### `artists` → `/api/artists`
`GET /` · `POST /` · `PUT /:id` · `DELETE /:id`.

### `automations` → `/api/automations`
Integrations: `GET /integrations`, `GET /integrations/:provider/connect`,
`DELETE /integrations/:provider`, `GET /integrations/export`.
Rules: `GET /` · `POST /` · `PATCH /:id` · `DELETE /:id`.
Web Push: `GET /push/vapid-public-key`, `POST /push/subscribe`,
`DELETE /push/unsubscribe`, `POST /push/test`.
Also `POST /cron/trigger`. Mounted twice — a public router before auth and the
full router after.

### `notifications` → mounted at `/api`
`GET|PUT /notification-settings` · `POST /notifications/test` ·
`POST /notifications/run`. Owns the reminder/digest cron; `collectSources`
reads `tasks.json` per scope.

### `templates` → `/api/templates`
`GET /` · `PUT /:eventType` · `GET /:eventType/text` — per-event-type crew rosters.

### `event-types` → `/api/event-types`
`GET /` · `PUT /` · `GET /checklists` · `PUT /checklists/:typeName`.

### `field-templates` → `/api/field-templates`
`GET /` · `PUT /:eventType` — custom field definitions driving PDF/Brief extras.

### `roles` → `/api/roles`
`GET /` · `PUT /`.

### `timelog` → `/api/timelog`
`GET /` · `POST /` · `PUT /:id` · `DELETE /:id`.

### `import` → `/api/import`
`POST /preview` · `POST /sync` — XLSX schedule ingestion, shared with the
Gmail poller.

### `documents` → `/api/documents`
`GET /:id`.

### `drive` → `/api/drive`
`POST /export-setlist`.

### `spotify` → `/api/spotify`
`POST /setlist-duration`.

### `tech-spec` → `/api/tools`
`POST /tech-spec-parse`.

## Inline in `server/index.js`

### Auth and session
`GET /healthz` · `GET|POST /login` · `POST /login/2fa` · `POST /logout` ·
`GET /register` · `POST /api/auth/register` · `POST /api/auth/register-invite` ·
`GET /api/invitations/validate`.

### Current user
`GET|PATCH /api/me` · `GET|POST /api/me/avatar` ·
`POST /api/me/change-password` · `GET /api/me/2fa/status` ·
`POST /api/me/2fa/setup|enable|disable` · `GET /api/spotify/status`.

### Demo mode
`GET /demo` · `GET /api/demo/data` — serves `demo.json`, the synthetic fixture.

### Teams, users, invitations
`GET|POST /api/admin/teams` · `PATCH|DELETE /api/admin/teams/:id` ·
`GET /api/teams` · `GET /api/users` · `PATCH|DELETE /api/users/:id` ·
`GET /api/invitations` · `POST /api/invitations/generate` ·
`DELETE /api/invitations/:token`.

Join requests: `POST /api/team/join-request` · `GET /api/team/join-requests` ·
`DELETE /api/team/join-request/:id` · `GET /api/me/join-requests` ·
`POST /api/me/join-requests/:id/accept|decline`.

Team surface: `GET /api/team/artists` · `GET /api/team/activity` ·
`POST /api/team/notify` · `PATCH /api/team/show/:artistId/:showId` ·
`PATCH /api/tasks/assigned/:artistId/:id` · `GET /api/tasks`.

### Setlists
`GET|POST /api/setlists` · `PATCH|DELETE /api/setlists/:id`.

### Admin — Google credentials
`GET /api/admin/google-status` · `POST /api/admin/google-token` ·
`POST /api/admin/google-credentials` · `POST /api/admin/google-service-account`.

**Read the Google auth section of `CLAUDE.md` before touching these** — the
refresh-token flow is deliberate and re-authenticating has broken it before.

### Admin — data maintenance
`GET|POST /api/admin/settings` · `POST /api/admin/restore-data` (pushes local
`server/data` **to** a deployment — not a restore from backup) ·
`POST /api/admin/prune-shows` · `POST /api/admin/dedupe-shows` ·
`POST /api/admin/cleanup-show-tasks`.

### Admin — backups
`GET /api/admin/backup-status` · `POST /api/admin/backup/run` ·
`GET /api/admin/backup/download`. See the backup section of `CLAUDE.md`.

# Found issues — running log

Things noticed while doing other work. **Logged, not fixed** — unless critical,
in which case the fix is linked and the row is struck through.

Convention: append here as things are found. Do not act on a row without asking.
Each row says what it is, how it was confirmed, and what it would cost to leave.

---

## Open

### Data / correctness

**Route-level read-modify-write can still drop an update**
Deliberately deferred when review item 3 was fixed. `updateJsonAndCache` exists
and the cron races are closed, but route handlers still read a list, modify it,
and write it back. Two saves to the same file within the same moment can still
lose one. Confirmed by construction, not observed in the wild. Lower risk than
the cron race that was fixed, because it needs two near-simultaneous human saves.

**`shows.json` for the Assaf workspace still carries a 1.28MB base64 PDF**
A stage-layout PDF sits in `shows[].tasks` on one old show — the wrong field. It
is the only copy there (the admin-root duplicate was removed), and the decision
was to keep it. The list endpoint no longer ships it (`slimShow` strips it), so
the user-visible cost is gone, but the file is still ~2.6MB on disk and every
read and write of shows carries it. Proper fix is migrating it into
`customFields` + `field-templates.json`, which is a two-part migration.

**`crewEmails` values are frozen history**
Nothing writes the field and no template renders it; the computation was removed
from the brief payload. The stale values are still on disk. Confirmed: no code
path writes it. Harmless, but it will confuse whoever reads the data next.

**Local `server/data` is far out of sync with production**
20 shows locally vs 41 in production. Findings from local data must be confirmed
against production before acting — this already caused one wrong conclusion
about the stray PDF. Also: one local show has `schedule: "test"` written over it
by a mistake of mine during testing. Production is unaffected.

**Local server on :3001 runs stale code**
Confirmed: creating a workspace against it dropped `workType`, which the current
`server/routes/artists.js` handles correctly. Anything checked against :3001 can
disagree with the source for no reason. Verification now runs a fresh instance on
:3005 against a copy of the data instead. Restarting it needs PM2, which is the
user's call.

**Client save errors show the server's raw field name**
"name is too long (max 200)" names the field, which is the useful half, but reads
like an API response rather than a sentence. Fine while the only writer is the
form; worth a friendlier mapping once there are more admin forms.

**A work day with every assistant already booked offers nothing and says nothing**
`ProjectDetail.jsx`. The "+ Book assistant" button hides once everyone on the
roster is booked on that day, which is right, but the branch below it only
explains itself when the roster is empty. With a one-person roster the control
simply vanishes after the first booking. Confirmed in the browser. Cosmetic, but
it reads as the feature breaking rather than as nothing left to add.

**Marking a booking paid re-reads every project**
Each paid/unpaid toggle calls `fetchAdminData()`, which refetches projects,
clients and assistants. Correct — `owedToAssistants` is derived server-side and
must not be guessed at — but it is three requests to reflect one boolean. Fine
at 10–15 projects a month; worth narrowing to a single-project refetch if the
Finance screen ever toggles many at once.

**`ProjectDetail` grew a second job**
It was a read-only screen; it now also books, unbooks and marks paid, and holds
the picker state for each work day. Still readable, but the work-day row is the
natural place for the next split once purchases land on the same screen.

**A project with a past first day but future days left is filed under PAST**
`ProjectsPage.jsx` groups on `firstWorkDay`, so a two-day project whose first day
has happened moves to PAST while a day is still ahead. Seen in the browser with
days on 05/08 and 20/08. Grouping on the LAST day, or on "any day still ahead",
would match how the project actually feels.

### Security / privacy

**`docs/` tracks files containing real personal data**
`docs/source-data/*.xlsx` and `*.docx` hold real client and crew contact details
and have been tracked in git since `c1ad909`. Git history is permanent, so this
cannot be undone by deleting the files now. Matters if the repo is ever shared
or made public. The downloaded Google service-account key was separately
gitignored before it could be committed.

**Login throttle counters are in-memory only**
Cleared by a deploy or restart. Adequate against online guessing, not a
persistent lockout. Only worth revisiting if real attack traffic appears.

### Product gaps found while building

**The `הפקות` Drive folder is not shared with the crew**
Confirmed by the user. Every Brief link is therefore visible only to her. Fine
if she forwards the document herself; broken if anyone is expected to click the
link. Worth deciding before a team relies on it.

**iOS push only works once the site is added to the home screen**
An Apple limitation, noted in the engineering brief. Currently nothing in the UI
says so, so it will read as broken rather than as a platform constraint.

**Adding to the home screen does not subscribe — and nothing says so**
Installing the PWA is necessary but not sufficient: a subscription only exists
after the user opens the installed app and taps Enable in Notification
Settings, which is what triggers `Notification.requestPermission()` and
`pushManager.subscribe()`. Confirmed by reading `pushSubscribe.js` against
`NotificationSettingsScreen.jsx`. Reported by the user as "notifications don't
work" after installing. The install step is the discoverable one, so this will
keep being read as a bug.

**A dead push channel produces no server-side signal**
`deliver()` in `notifications.js` computes `result.push = 'no-subscription'`,
but the three cron call sites (lines 222, 243, 255 in `runTick`) discard the
return value entirely. So a push channel that has never delivered anything
logs nothing at all — indistinguishable from one that is working. Confirmed by
reading the call sites. Costs: the only way to find out push is dead is for a
human to notice missing notifications, which is exactly what happened here.
One `console.log` of the per-user result in `runTick` would close it.

### Dead / structural

**`ArtistSwitcher` is unrendered dead code**
`client/src/App.jsx`. Owns an add-workspace button but is never rendered —
which is why creating a workspace was impossible until `84c7ab8`. Left in place
deliberately; deleting it is a separate change.

**No tests anywhere, and `userData.js` now carries security logic**
`parseUserId` / `dataPath` / `cacheKey` / `artistScopedId` decide which
workspace's data a request reaches. They are pure functions and cheap to test.
This rose in importance when the artist-scope authorisation was added.

**`server/index.js` ~1800 lines, `client/src/App.jsx` ~2000**
Known debt. The agreed order is tests first, then extraction, and only when
touching those areas anyway.

### Cosmetic

**`useClones: true` costs a deep clone on every cache hit**
Measured ~0.16ms on the largest file versus ~5ms for a cold read. Correct
trade — safety over speed — recorded so nobody "optimises" it without knowing.

**TeamPanel task checkbox is permanently `checked={false}`**
It works as a click-to-complete control, but a checkbox that never appears
checked is a confusing affordance.

---

## Fixed while found (kept for the record)

- Every action inside an expanded project card collapsed it. `fetchAdminData`
  raised the loading flag on action-triggered refetches, swapping cards for
  skeletons and unmounting them. Fixed in `2578f84`; without it the expanding
  card was unusable.
- Administration's Team tab rendered `TeamPanel`, the production team screen, in
  the wrong workspace. Fixed in `3125e4e` as part of building the roster that
  belongs in that slot.
- **Any failed write under `withFileLock` killed the server process.** A
  rejection derived from `run.finally(...)` was handled by nobody, so an ordinary
  validation failure inside a mutator returned its 400 and then took Node down.
  Reachable by any signed-in user with one wrong field — confirmed with
  `{"paymentTerms":45}` on a client. Fixed in `9ba675b`; this one was critical
  and could not wait.
- A push subscription the server refused was still reported as enabled, so the
  toggle went on and nothing was ever delivered. `a0c419b`.
- **Push subscription failures were completely invisible.**
  `subscribeToPush()` never checked the response of
  `POST /api/automations/push/subscribe`, so a server-side rejection still
  resolved successfully: the toggle flipped on, the UI said "Push notifications
  enabled", and nothing was ever delivered. Reported by the user as push not
  working with the switch showing on. Now checks `res.ok`, rolls the browser
  subscription back so device and server agree, and surfaces the server's error.
- **The push toggle showed session state, not subscription state.**
  `pushEnabled` was `useState(false)` with nothing syncing it to
  `pushManager.getSubscription()`, so it read off after every reload even when
  subscribed — and could read on while the server had no record. Now derived
  from the real subscription on mount.
- Login threw a 500 on almost every wrong password, and **blocked external users
  from signing in at all** — `timingSafeEqual` on different-length buffers. Fixed
  in `9ce306b`; this one was critical and could not wait.
- No error boundary anywhere: any component crash blanked the whole app. `38d7844`.
- Team members saw an empty workspace, and the permission guards in `shows.js`
  were never switched on. `186b5e3`.
- `?artistId=` was unauthorised and unsanitised. `44d7fe9`.
- No backups of any kind. `12c8cf8`, `41aede1`.

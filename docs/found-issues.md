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

- Login threw a 500 on almost every wrong password, and **blocked external users
  from signing in at all** — `timingSafeEqual` on different-length buffers. Fixed
  in `9ce306b`; this one was critical and could not wait.
- No error boundary anywhere: any component crash blanked the whole app. `38d7844`.
- Team members saw an empty workspace, and the permission guards in `shows.js`
  were never switched on. `186b5e3`.
- `?artistId=` was unauthorised and unsanitised. `44d7fe9`.
- No backups of any kind. `12c8cf8`, `41aede1`.

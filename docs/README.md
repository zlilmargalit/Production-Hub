# docs/

Layout:

- `reference/` — written reference material (PDFs).
- `source-data/` — source spreadsheets and working documents.
- `blueprints/` — design blueprints (unchanged).

## Credential files moved out (2026-08-09)

Two plaintext credential files used to live in this folder. They were never
committed (`.gitignore` caught them, confirmed against full `git log --all`
history), but a project folder that gets zipped and shared is the wrong place
for secrets. They now live outside the repo at `~/.config/production-hub/`
(mode 700, files 600):

- `client_secret_359834545481-….apps.googleusercontent.com.json` — a **web**
  OAuth client. This is **not** the credential the app runs on: the live one
  is an *installed* (desktop) client with a different `client_id`, stored at
  `DATA_DIR/gmail-credentials.json`. Nothing in the code reads this file.
- `claude-schedule-automation-….json` — a Google **service-account** key.
  Per the Google auth section in `CLAUDE.md`, service accounts do not work for
  this app (no Drive storage quota on a personal, non-Workspace account) and
  that code path is dead. Kept only in case the account is ever upgraded to
  Workspace.

Neither move required a code change — no source file references either path.

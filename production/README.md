# Production Hub — Nordic Editorial Redesign

Drop-in replacements for your existing files. **Only the four files below need to change** — your other components (`ShowForm.jsx`, `TaskManager.jsx`, `CrewManager.jsx`, `ConfirmModal.jsx`, `main.jsx`) work as-is because the redesign is driven by CSS class changes plus light JSX edits in just two components.

## Files to copy

| Replace in your repo | With |
|---|---|
| `src/App.css`          | `src/App.css` |
| `src/App.jsx`          | `src/App.jsx` |
| `src/components/ShowCard.jsx` | `src/components/ShowCard.jsx` |
| `src/components/ShowList.jsx` | `src/components/ShowList.jsx` |

## What changed

**App.css** — fully rewritten. New token system (cream surfaces, indigo + amber/orange palette, no green), Bricolage Grotesque + Assistant + Heebo type stack, editorial chunky borders and offset shadows, color-coded event types, animated marquee, hardcoded `data-event-type` color map for the five known Hebrew event types.

**App.jsx** — removed the left-side theme toggle (the one next to the logo). The right-side toggle remains as the single light/dark switch. All state, fetch paths, and handlers are unchanged.

**ShowCard.jsx** — three small additions:
- `data-event-type={show.eventType || ''}` on the root card so CSS can paint it
- A `<div class="show-card-band" />` colored stripe before the header
- A `<div class="show-card-type">` label with the event type
- `lang={isHebrew}` on the `<h2>` so the Hebrew font stack activates per-card
- Crew chip avatars (initials with per-crew-member palette color)
- Date now uses the new `meta-date` class for its featured size
- `dir="auto"` instead of `dir="rtl"` so English shows also read naturally

**ShowList.jsx** — adds the editorial `page-header-edit` block (big "Shows." headline, count, scrolling marquee) above the filter bar.

## Deployment

Same as your existing flow. The fonts load from Google Fonts via `@import` at the top of `App.css` — no `package.json` changes needed.

### Local
```bash
npm run dev
```

### Railway
No changes — just push. The CSS `@import` is fetched at runtime, so the build doesn't need to know about Bricolage Grotesque.

If you'd rather self-host the fonts (recommended for production), grab Bricolage Grotesque, Assistant, and Heebo from [Google Fonts](https://fonts.google.com/), drop them in `public/fonts/`, and replace the `@import` line at the top of `App.css` with `@font-face` declarations.

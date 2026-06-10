# Claude Code — Implementation Prompt (Space Efficiency)

Paste into Claude Code from the root of the Production Hub repo, with the
`design_handoff_space_efficiency/` folder (README.md + `prototypes/`) present.

---

## Prompt

```
I'm tightening the vertical layout of this React app (Production Hub — Hebrew/RTL,
warm-beige design system). The problem: every page opens with a giant display heading
plus a row of full-height stat cards that eat ~30% of the viewport, pushing real
content below the fold. Full spec is in design_handoff_space_efficiency/README.md,
with an interactive Current-vs-Proposed prototype in
design_handoff_space_efficiency/prototypes/Space Efficiency.html.

The HTML is a DESIGN REFERENCE, not code to copy. Recreate the patterns using this
repo's existing components, CSS variables, and layout classes. Don't add a new styling
system. Read the README and prototype first, then find the current page-header/stats
layout (used by Teams, Shows, Crew) and the Teams permissions + Shows filter components
before writing code.

Implement in this order, pausing after each for review:

1. SHARED COMPACT PAGE-BAR (biggest win — do this first):
   - Build one reusable component (title, accentColor, count, metrics[], tabs, actions).
   - Heading shrinks to ~1.7rem (keep the Bricolage weight + accent dot), count shown
     inline, and the 4 stat cards become a single inline metric strip on the right.
   - Tabs sit immediately under it; page content starts above the fold.
   - Make the bar position:sticky under the navbar with a hairline border when stuck.
   - Swap Teams over to it first; then reuse on Shows, Crew & Types, Tasks.
   - Keep the giant display heading ONLY for landing/empty states.

2. CONTENT PERMISSIONS MATRIX (Teams member detail):
   - Replace the three tall rows with a bordered grid: header row (Area | View | Edit),
     one row per area with the description inline next to the title.
   - Each View/Edit cell is a full-cell toggle button (~38px tall) with a green checked
     fill — bind to the existing per-area {view, edit} permission state.
   - Move Save to a solid --ink button at the section's top-right (not grey at bottom).

3. SHOWS FILTER PANEL:
   - Convert the vertical MONTH list into wrapping chips (same style as TYPE).
   - Add a Clear link on MONTH and a footer bar with a "Showing {month} · {type}"
     summary + a solid Apply button. Wire to the existing filter state.

Match the tokens, square corners, RTL handling, and tabular-nums for numbers per the
README. Respect prefers-reduced-motion for the sticky/transition effects. Keep all
toggles keyboard-accessible.
```

---

## Notes for the developer
- **Change 1 is the high-leverage one** — landing it as a shared component reclaims ~340px on *every*
  page at once, so prioritize it and verify it on Teams before rolling out to other pages.
- Don't change any data shapes: permissions keep their existing per-area `{view, edit}` structure;
  filter chips drive the existing show-filter state. These are UI-only changes.
- The three changes are independent and can ship as separate PRs.

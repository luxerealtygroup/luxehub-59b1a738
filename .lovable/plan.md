# Launchpad UI — 90-Day Onboarding

Database is migrated and seeded (20 module rows, 98 placeholder slides). This plan covers the interface only. No training content is authored.

## Slide counts are variable by design

Every slide-facing piece reads from the database, never from a constant:

- The viewer loads all slides for a module ordered by `slide_number` and derives `total` from the returned array length.
- The progress bar is `completedSlides / slides.length`, and the counter reads "Slide N of {slides.length}".
- The slide-jump strip renders one dot per returned row, so 2 slides and 12 slides both render correctly.
- Next/Back bounds, the "last slide → module complete" check, and the "Next module" hand-off all compare against the fetched length.
- Slide type drives rendering (`content`, `practice_assignment`, `knowledge_check`), not slide position — so a practice assignment at slide 4 or slide 11 renders identically.
- Module cards on the home page show a slide count pulled per module, not a hardcoded 5.

Adding, reordering, or removing slides later is a data change only. No UI rework.

## Screens

**Launchpad home** — `/dashboard/launchpad`

- Modules grouped by day range: Days 1-15, Days 16-45, Days 46-75, Days 76-90.
- Each card: module number, title, slide count, progress ring, status pill (Not started / In progress / Complete).
- Module 10 renders with a "Reference" badge and a distinct card treatment — no assignment or knowledge check.
- Header strip: "X of 12 modules complete" plus the agent's track.
- No track set: an empty state asking the agent to have an admin assign their track. Admins/owners get a Junior/Associate preview toggle.

**Module viewer** — `/dashboard/launchpad/:moduleId/:slideNumber`

- One slide in a fixed frame, Back / Next controls, progress bar with counter, and a slide-jump strip.
- Left/right arrow keys navigate; the URL carries the slide number so refresh and link-sharing land on the same slide.
- Advancing past a slide records completion; the last slide marks the module complete and offers "Next module".
- Empty slide bodies show a neutral "Content coming soon" placeholder rather than a blank frame.

**Mentor / admin progress** — a tab on Launchpad home, visible to mentors and admins

- Table of assigned agents: name, track, modules complete, current module, last activity.
- Admins see all agents; mentors see only the agents whose `mentor_id` is them.

**Track and mentor assignment** — added to the existing admin agent profile screen

- Two selects (track, mentor) writing to `profiles`. The database trigger already blocks non-admins.

## Navigation

A top-level "Launchpad" item with a rocket icon in the main sidebar, visible to all signed-in team members.

## Technical notes

- New: `src/pages/Launchpad.tsx`, `src/pages/LaunchpadModule.tsx`, `src/hooks/useLaunchpad.ts`, and `src/components/launchpad/` (module card, slide frame, nav controls, progress rail, mentor progress table).
- Edited: `src/App.tsx` (two nested routes under `/dashboard`, wrapped in `RoleGuard`), `src/components/AppSidebar.tsx` (nav entry), the admin agent profile page (track/mentor selects).
- Data access via React Query hooks against `launchpad_modules`, `launchpad_slides`, `launchpad_progress`, `launchpad_module_progress`. Module query filters `track IN (agent track, 'unified')` and orders by `sort_order`.
- Progress writes are upserts on the existing unique keys `(user_id, slide_id)` and `(user_id, module_id)`, so re-visiting a slide is idempotent.
- Styling uses the existing LUXEhub semantic tokens; no new color values.

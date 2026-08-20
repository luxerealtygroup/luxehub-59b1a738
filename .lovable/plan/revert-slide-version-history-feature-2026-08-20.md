# Revert: Slide version history feature

Fully undo the unrequested slide version-history build. No evaluation, no partial retention.

## Database (one migration)

- Drop the `capture_launchpad_slide_version` trigger on `launchpad_slides`.
- Drop the function `public.capture_launchpad_slide_version()`.
- Drop the table `public.launchpad_slide_versions` (cascade removes its RLS policies and the two indexes).

No other table, function, trigger, or policy is touched. No slide content is read or written by this migration.

## Files

- Delete `src/lib/slideDiff.ts`.
- Delete `src/components/launchpad/SlideVersionHistory.tsx`.
- `src/hooks/useLaunchpad.ts`: remove only lines 33-63 — the `LaunchpadSlideVersion` interface and the `useSlideVersions` hook. Everything else in the file stays byte-identical.
- `src/pages/LaunchpadModule.tsx`: restore to its pre-change state — remove the `SlideVersionHistory` import, the `historyOpen` state, the `History` icon import, the admin/owner "History" button in the header, and the `<SlideVersionHistory />` render block at the bottom.

## Verification after execution (both reported unprompted)

A) Schema and file check:
- Query for a `launchpad_slide_versions` table, a `capture_launchpad_slide_version` function, and any trigger on `launchpad_slides` — each must return zero rows.
- Confirm the three files/additions are gone and the app typechecks clean.

B) Module 12 content proof:
- Query all 7 slides of Module 12 (`5b61cb4b-598e-4db7-b5ec-c23ca60a4c53`) and paste the raw stored body text verbatim in code blocks (so markdown does not eat leading `1)` markers), with `char_length` for each, as evidence nothing was altered by either the accidental build or this revert.

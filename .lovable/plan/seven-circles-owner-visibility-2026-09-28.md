# Seven Circles owner visibility

## What will change
- Replace the owner-only “not scored yet” text with the full Seven Circles layout in both owner viewing paths.
- In **View as Agent → Reflection**, show all seven rows read-only; when empty, add a small **Not scored yet** badge.
- In **Company Business Planning → 2027 Team Plans → agent detail**, keep the private section collapsed but show the same full empty/read-only layout when opened.
- Preserve existing privacy: only the agent and Kristen can read saved scores; no team rollups or coaching use.

## Verification
- Confirm Terra’s View as Agent → Reflection at 1366px.
- Confirm the Company agent-detail section opens to the complete structure.
- Check Demo Agent’s real-agent Reflection renders the editable section without saving or changing data.
- Check the preview build and browser console for errors.

## Technical details
- Treat a missing `planning_circles` row as an empty circles object rather than a reason to replace the section.
- Add an empty-state badge to the shared Seven Circles display so both owner paths stay consistent.
- Keep all selectors disabled and ONE Thing fields read-only in owner views.

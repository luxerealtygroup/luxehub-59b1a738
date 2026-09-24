# Fix collapsed responsive tables

## What will change
- Make the “Needs a portal” desktop/tablet table keep readable column widths inside its own touch-scroll area.
- Add non-wrapping headers and key name/date cells, constrain the Action column, and use compact icon actions at narrower table widths with tooltips.
- Render one stacked client card per row on phones, with all requested details and two full-width actions.
- Audit Pipeline, Transactions, agent lists, Open House attendees, Client Portals, and Messages for the same character-by-character collapse and apply only the necessary layout fixes.

## Verification
- Test the affected screens at 360, 390, 414, 768, 1024, and 1366 px, including 125% zoom.
- Confirm page-level horizontal overflow is absent while wide tables remain independently scrollable.
- Capture “Needs a portal” at 390 px and 1366 px for review.

## Technical details
- Use responsive card/table rendering, table `min-width`, `whitespace-nowrap`, fixed action sizing, and local `overflow-x-auto` with touch scrolling.
- No database, permission, or publishing changes.

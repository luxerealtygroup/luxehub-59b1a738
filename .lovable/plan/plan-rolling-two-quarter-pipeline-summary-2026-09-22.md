# Plan: Rolling Two-Quarter Pipeline Summary

## What will change
- Add one shared quarterly pipeline summary to the top of both the agent dashboard and company dashboard.
- Show the current quarter, next quarter, and a combined total side by side.
- Each section will show weighted units, projected volume, projected GCI, and pending / conditional / closed counts.

## Date and population rules
- Derive quarter labels and years from today, including year rollover from Q4 to Q1.
- Assign each record using its linked deal closing date when available, otherwise its expected closing/pending date.
- Use the agreed population: records entered during the current year, including Leads, excluding finished records.
- Keep sales at 1 unit and leases at 0.33 units.
- Scope agent dashboards to the effective agent and the company dashboard to the current tenant under existing access rules.

## Technical approach
- Add a reusable calendar-quarter utility and dashboard summary component.
- Read existing pipeline client fields directly; no duplicate storage or database migration.
- Reuse the same component and calculations in both dashboard views so the figures cannot drift.
- Preserve all existing access policies and keep the work in preview.

## Verification
- Confirm today shows Q3 2026, Q4 2026, and Q3 + Q4.
- Simulate October 1 to confirm labels roll to Q4 2026, Q1 2027, and Q4 + Q1.
- Verify agent and company scoping in the preview and check the final build status.

# Plan: 2026 Important Dates Calendar

## What will change
- Rename the dashboard calendar from “2026 Closing Calendar” / “My 2026 Closings” to “2026 Important Dates”.
- Keep existing closing/forecast items visible.
- Add realtor-side portal and transaction dates from existing records only, so portal edits automatically update the calendar.
- Add calendar filters and visual states requested by type, urgency, past dates, and agent.

## Calendar sources
Use existing tables as the source of truth; no duplicate date table will be created.

Included portal/current transaction dates:
- Offer/acceptance date
- Deposit due date
- Portal transaction condition deadlines and resolved/waiver/firm dates
- Appraisal
- Home inspection
- Final walkthrough
- Requisition date
- Lawyer/signing appointments
- Closing/possession date
- Custom portal key dates
- Legacy client transaction dates where those records still exist

Existing FUB closing items remain on the same calendar.

## Visibility rules
- Agent dashboard: only dates for that agent’s assigned/producing clients.
- Company/admin dashboard: all visible tenant dates, with an agent filter.
- Client portal: unchanged.
- Existing role and database access rules stay intact; no RLS changes.

## Display and actions
- Add a small legend and type filter for closing, condition deadline, deposit, inspection/appraisal, walkthrough, and other.
- Add an agent filter in the company/admin view.
- Each item shows client name, property address, and date type.
- Urgent deposit and condition deadlines due in the next 3 days are highlighted.
- Past dates remain visible but greyed out.
- Clicking a portal-backed entry opens that portal/transaction in the existing realtor-side portal area where possible; otherwise it opens the existing portal preview.

## Technical notes
- Add a combined calendar hook to normalize existing FUB, portal, condition, key-date, and legacy transaction rows into one entry shape.
- Deduplicate portal-backed closings against FUB closings where there is a linked FUB deal and matching close date.
- Use existing semantic styling tokens and current UI components.
- No database migration is expected unless the existing schema proves insufficient; any required database change will be additive only.
- Keep everything in preview and do not publish.

## Verification
- Confirm Terra White’s calendar shows real portal dates, including known dates for Kylie & Seb Ramirez, Pat Ullman, and Lisa Sharpe.
- Confirm the company calendar shows all agents’ portal dates and the agent filter.
- Check the latest build status after the changes.

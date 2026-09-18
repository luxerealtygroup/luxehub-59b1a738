# Goals: tenant scoping, stored agent goals, and goal editing

## 1. The cross-tenant leak — corrected finding (read this first)

I checked the database rules, not just the page code. The company goal table already
enforces team scoping at the database level: every read rule on it requires the row's team
to equal the signed-in person's team. So Roberto Real Estate, Homes Into Reality and
Kirstine-Ellis would **not** actually receive Luxe's 85 — they get nothing back, and the page
then shows 0. My earlier statement was wrong on the outcome; the missing team filter in the
query is real, but the database is catching it.

What is genuinely wrong, and what I will fix:
- The query asks for "the one record for this year" with no team filter. Today only Luxe has
  a record, so it works. The day a second team saves one, that query becomes ambiguous and
  can error out for everyone — a fragile query sitting behind a guard.
- A hub with no record of its own shows zeros as if the target were zero, instead of an
  empty state prompting an owner to set one.

### Scope of the tenant audit

Every table that holds company- or team-level data was checked for both the database rule
and the query.

| Area | Query filters team? | Database rule scopes team? | Action |
|---|---|---|---|
| Company goals — Business Planning page | No | Yes | Add filter + empty state |
| Company goals — Admin Dashboard | No | Yes | Add filter |
| Company goals — Team Goals editor (read + save) | No | Yes | Add filter; set team on new records |
| Company goals — Annual Budget chart | No | Yes | Add filter |
| Company budget expenses (all reads/writes) | No | Yes | Add filter |
| Agent production goals (all pages) | No | Yes | Add filter where company-wide |
| Agent goals, weekly 4-1-1, deal source targets, app settings | Mixed | Yes | Verified, no change |
| Organizations, user roles, email plumbing, job locks | n/a | Handled separately | No change |

Tables with no team column at all are the global ones by design (organizations, roles,
email delivery records, background job locks) — none of them carry brokerage business data.

So: the pattern does exist in many places, but in every case the database is the backstop,
and no other unguarded path was found. The fix is defence in depth plus honest empty states.

## 2. Agent monthly goals move into the database

Today the monthly breakdown and the planning assumptions (average sale price, commission
rate, split, fallout) live only in the browser.

- Add two new optional fields to the existing agent production goals record: one holding the
  twelve-month breakdown, one holding the planning assumptions. Nothing dropped or renamed.
- On loading the Goals page: use the stored values if present; otherwise, if the browser
  still holds values, write them up to the database once and use them from then on;
  otherwise fall back to an even split as today.
- Every edit to a month box saves to the database (debounced), not the browser.

**Who lost theirs when site data was cleared:** there is no way to know. The values were
never sent anywhere, so nothing recorded who had them. Anyone whose record has no stored
breakdown after the migration pass either never set one or lost it — I can list those agents
after the change ships so you can ask them to re-enter.

## 3. Setting goals

**Company goal:** add a "Set company goal" action for owners and admins on the Company
Business Planning page, opening the same editor that already exists under Admin Dashboard →
Budget & Finances. It takes the annual deal target and an optional per-quarter split; when
quarters are entered the page uses them instead of annual ÷ 4. Hubs with no record show an
empty state with this button.

**Agent goals set by an owner:** under View as Agent, owners and admins can now edit that
agent's goals instead of the page being read-only. The record saved is the agent's, never the
admin's. Every such change is written to a new insert-only change history (who changed it,
which agent, field, from → to, when) and shown to that agent on their own Goals page as
"Set by <name> on <date>". A plain agent still only edits their own.

## Technical notes

- Migration (additive only): `production_goals.monthly_plan jsonb`,
  `production_goals.plan_assumptions jsonb`; new table `agent_goal_audit`
  (org_id, agent_user_id, changed_by, field, old_value, new_value, created_at) with grants,
  RLS, insert-only, readable by the agent and by admins/owners in the same team.
- New additive policies letting admins/owners insert and update production goals for agents
  in their own team; existing self-service policies untouched.
- All company goal reads gain `.eq('org_id', orgId)` from the tenant hook; inserts continue to
  rely on the existing team-stamping trigger.
- Files: `CompanyBusinessPlanning.tsx`, `AdminDashboard.tsx`, `TeamGoals.tsx`,
  `AnnualBudgetChart.tsx`, `CompanyBudget.tsx`, `Goals.tsx`, plus a small
  `src/lib/agentGoalAudit.ts` mirroring the existing pipeline audit helper.
- Nothing published. Preview only.

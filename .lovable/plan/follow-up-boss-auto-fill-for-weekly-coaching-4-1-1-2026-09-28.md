# Follow Up Boss auto-fill for Weekly Coaching / 4-1-1

## Step 1 — What exists today

**Current weekly sync** (`sync-fub-weekly`, writes to `weekly_411`):
- Runs weekly (Mon ~8pm Toronto via two UTC slots, plus a daily noon catch-up). Only weeks Sep 7 and Sep 14 have ever run; 21 agent-weeks filled.
- Agents: producing agents matched to a FUB user by email.
- Pulls: calls total / outbound / connected (2+ min), talk time, texts sent/received (per-person scan), new leads + pond claims, appointments set (created in week) and held (start in week, not cancelled/no-show), active deals and deals created.
- Misses: emails, speed to first contact, pipeline adds, agreements signed, pending, closed, GCI; no nightly run; no backfill; agent-entered values not shown next to FUB values; no targets comparison.

**What FUB can give, per agent per week, and the rule**

| Metric | Source | Rule | Reliability |
|---|---|---|---|
| Outbound calls | /v1/calls | not incoming, created in week, userId | High |
| Conversations | /v1/calls | duration >= 120s (either direction) | High (outcome field often blank, so duration only) |
| Texts sent | /v1/textMessages per person | outgoing, not failed/queued, dedupe by id | Medium (slow; per-person scan) |
| Emails sent | /v1/emails not exposed for user-sent mail | not measurable — shown as "not available" | None |
| New leads | /v1/people sort=created | created in week, assigned to agent, excl. rentals/vendors | High |
| Speed to lead | people created in week + first outbound call/text to them | median minutes to first touch | Medium |
| Appointments set / held | /v1/appointments | set = created in week; held = start in week, outcome not cancelled/no-show | Medium (depends on agents logging appointments in FUB) |
| Pipeline adds | /v1/events + people stage | people whose stage changed into an active/nurture stage in week (from stage-change events) | Medium |
| Agreements signed | /v1/deals | deal created in week for that agent (buyer or seller pipeline) | Medium — FUB has no "agreement" stage; deal creation is the proxy |
| Deals pending | /v1/deals | stage Pending, stage entered in week | Medium (stage-entry date) |
| Deals closed + GCI | /v1/deals | same shared productionKind rule: Closed, sold date in week; full GCI split by agent, weighted units | High |

## Step 2 — Build

1. **Additive columns** on `weekly_411`: `fub_conversations`, `fub_pipeline_adds`, `fub_agreements`, `fub_pending`, `fub_closed`, `fub_closed_units`, `fub_gci`, `fub_speed_to_lead_minutes`, `fub_emails_sent` (null = not available). Existing agent-typed columns never written by the sync.
2. **Extend `sync-fub-weekly`**: add the new metrics; accept a date range to backfill; include Kristen explicitly; "current week so far" mode for nightly runs.
3. **Schedule**: nightly 2am Toronto (current week so far + last week) and Monday 7:00 AM Toronto refresh. Replace the existing three weekly jobs so there's no duplicate polling.
4. **Backfill** Jul 13 2026 to now (12–13 weeks), run week by week.
5. **Agent Weekly Coaching / 4-1-1 week**: read-only "From Follow Up Boss" block — five KPIs first (Conversations, Pipeline adds, Appointments held, Agreements signed, Closed + pending), then calls, texts, emails, new leads, speed to lead. Each shows FUB vs agent-entered side by side, a gap flag when they differ a lot (e.g. "FUB shows 6 appointments, 4-1-1 says 1"), and green/amber/red vs their submitted 2027 weekly commitment. "As of" stamp + Refresh for owner/admin.
6. **Company Dashboard → Team 4-1-1**: sortable table of the five KPIs per agent for the chosen week, with team total.
7. **Report back**: last 4 weeks per agent, screenshots at 390px and 1366px.

## Technical notes
- Colour thresholds: green >= 100% of target, amber 70–99%, red < 70%. Gap flag when difference >= 3 and >= 50%.
- Reads only from FUB; no writes to FUB.
- Emails are not available from the FUB API for agent-sent mail, so that line will say so rather than show 0.

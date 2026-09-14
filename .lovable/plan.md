# Weekly Follow Up Boss actuals — audit first, then build

## What already exists (audit)

**Follow Up Boss plumbing (reuse, do not duplicate)**
- `supabase/functions/_shared/fub.ts` — resolves the Follow Up Boss key **per organization** from the vault, falling back to the instance key only for the original org. This is the same key the open house push uses. No new key needed anywhere.
- `supabase/functions/follow-up-boss/index.ts` — general read proxy (people, deals, notes, calls, smart lists) with caller roles and retry on network failures.
- `supabase/functions/openhouse-fub`, `openhouse-fub-sweep`, `fub-webhook`, `fub-create-contact`, `fub-post-note`, `fub-search-contacts` — contact-level pushes, unrelated to weekly numbers.
- `agent_fub_prefs` — per-agent open house stage preference (org scoped).

**Weekly actuals (already one table — extend it)**
- `weekly_411` already is the weekly actuals table: `user_id`, `org_id`, `week_start_date`, goals (`calls_goal`, `appointments_goal`, `listings_goal`, `contracts_goal`), actuals (`calls_actual`, `appointments_actual`, `listings_actual`, `contracts_actual`), activity columns (`dials`, `contacts_made`, `connects`, `conversations`, `texts_sent`, `talk_time_minutes`, `leads_received`, `appointments_set`, `appointments_held`, `pipeline_additions`, `contracts_signed`, `firm_deals`, `doors_knocked`, `database_size`), health columns, priorities/reflections, and **`fub_synced_at`** already marking automated weeks.
- `record_weekly_411_actuals` — existing security-definer write path used by the MCP tool.
- UI: `src/pages/FourOneOne.tsx` (Weekly / Scorecard / Monthly / Practice), `src/components/Team411.tsx`, `src/lib/utils/weekly411Fallback.ts`, Reports 4-1-1 + Conversions tabs.
- `profiles.fub_user_id` (integer) **already exists**; `fub_user_email` does not.

**Conclusion:** no new actuals table. Everything lands on `weekly_411` + `profiles`, plus one small run-log table for the admin screen.

## What I will build

### 1. Agent to FUB user mapping
- Add `profiles.fub_user_email` (text, nullable). `fub_user_id` already exists.
- Sync matches `GET /v1/users` on email, case-insensitive, per tenant. No name guessing. No match leaves both null.

### 2. Weekly actuals columns added to `weekly_411`
`new_leads`, `leads_claimed_from_pond`, `calls_total`, `calls_outbound`, `calls_connected`, `talk_time_seconds`, `texts_received`, `deals_active`, `deals_created`, `fub_user_id`, `fub_sync_status`, `fub_sync_error`, `fub_raw` (jsonb). Existing columns keep serving their current purpose; `calls_total` also writes `dials`/`calls_actual`, appointments held writes `appointments_actual`, so the existing Goal Tracking block lights up.
Unique index on `(user_id, week_start_date)` (org already on the row). Reads unchanged; service role writes only for the new sync columns.

New table `fub_weekly_sync_runs` (org, week_start, week_end, started/finished, status, agents_synced, agents_unmatched, error) purely for the admin screen — it is a run log, not a second actuals store.

### 3. Edge function `sync-fub-weekly`
- Args `week_start` / `week_end`, defaulting to the last completed Monday–Sunday in America/Toronto.
- Idempotent upsert per agent-week, so re-running a week overwrites.
- Key resolved through the existing shared helper. Missing key writes `fub_sync_status = 'not_configured'` with a clear message rather than silence.
- Paging exactly as the API allows: `/v1/calls` and `/v1/textMessages` have no date or user filter, so page newest-first with `limit=100` and stop once `created` predates `week_start`, with a page cap that is logged when hit. `/v1/people` uses `sort=created`, `includeUnclaimed=true`, paged backwards. `/v1/appointments` uses `start` + `end` + `userId`. `/v1/deals` filters by `userId`/`status` with `createdAt` filtered in code. No emails metric. Basic auth, key as username; 429 handled with exponential backoff honouring rate limit headers.

**Counting rules**
- Rental leads excluded from `new_leads`; tenant setting in `app_settings` listing rental sources/stages/tags, defaulting to anything containing "rent".
- Unassigned pond leads count to nobody; on assignment they count as `leads_claimed_from_pond` in the assignment week.
- `calls_connected` / `talk_time_seconds` only count calls with a real outcome and duration greater than zero.
- `appointments_held` = appointments in window not cancelled or no-show; `appointments_set` = created in window.
- Durations stored in seconds, formatted in the UI.

### 4. Weekly page wiring
Goal Tracking reads synced Calls and Appointments; Listings and Contracts stay manual and are labelled that way. Lines with no Follow Up Boss equivalent show "manual entry", never a misleading zero. A header above the numbers shows the week covered and last sync time, or "not measured yet".

### 5. Schedule
One weekly run, Sunday 8pm America/Toronto. Two cron entries (00:00 and 01:00 UTC Monday) with the function running only when Toronto local time is 8pm, so it stays exact across daylight saving. No polling.

### 6. Admin view
New Follow Up Boss sync card under admin settings: last run time, week covered, per-agent row counts, unmatched agents with a dropdown to pick their Follow Up Boss user by hand, and a Run now button that accepts a week for backfilling past weeks.

## Honesty note on delivery
When finished I will state, metric by metric, which numbers come straight from the API and which are derived or unavailable — rather than filling a column with zeroes.

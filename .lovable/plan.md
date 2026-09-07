# Weekly 4-1-1 actuals: new MCP write tool

Add one new agent-integration tool, `record_weekly_411_actuals`, so a weekly Follow Up Boss automation can push each agent's activity numbers into the same weekly 4-1-1 record the accountability tab already reads. Nothing about the existing read tool or the 4-1-1 page changes.

## What I checked

- The weekly 4-1-1 table already stores `dials`, `appointments_set` and `contacts_made`, plus a free-text `notes` field.
- It has **no** place for: leads received, connects, conversations, texts sent, talk time, or speed to first touch. Those need to be added.
- There is **no** uniqueness rule on agent + week, so re-running a week today would create a duplicate row. That rule has to be added for a safe overwrite.
- Today only the agent themselves can write their own weekly row; owners/admins can read teammates' rows but not write them. So a controlled server-side write path is required.

## Database changes (one migration)

1. Add integer columns for `leads_received`, `connects`, `conversations`, `texts_sent`, `talk_time_minutes`, `speed_to_first_touch_minutes`. Existing rows stay untouched (empty values).
2. De-duplicate any pre-existing agent+week duplicates (keep the most recently updated), then add a uniqueness rule on agent + week start so re-running a week overwrites instead of duplicating.
3. Add a server-side function `record_weekly_411_actuals(...)` that runs with elevated rights but only after verifying the caller is an owner or admin **and** that the target agent belongs to the caller's own brokerage. It looks the agent up by email within that brokerage, then inserts or updates that agent's week row, writing only the actuals fields and the optional note. Goals, priorities, wins and anything the agent typed are never overwritten.
4. Access rules on the 4-1-1 table itself stay exactly as they are — the new function is the only new write path.

## Tool behaviour

- Name: `record_weekly_411_actuals`, title "Record weekly 4-1-1 actuals".
- Inputs: `agent_email` (required), `week_start` (required ISO date, normalised to the week's Monday), `actuals` object with the eight integer fields (each optional, zero or more), and optional `note`.
- Marked as a write tool (not read-only, not destructive), idempotent per agent + week.
- Rejects unauthenticated calls, then calls the server-side function; the caller's own permissions decide the outcome.
- Response confirms agent, week, whether the row was created or updated, and which fields were written.

## Unmatched `agent_email`

No row is created and nothing is guessed. The tool returns a clear error: the email is not an agent in your brokerage. Deliberately the same message whether the email is unknown entirely or belongs to another brokerage, so the tool can't be used to probe for accounts elsewhere. The error suggests checking the Follow Up Boss email against the agent's login email. A batch run can therefore skip that agent and continue.

## Files touched

- `src/lib/mcp/tools/record-weekly-411-actuals.ts` (new)
- `src/lib/mcp/index.ts` (register the tool)
- `.lovable/mcp/manifest.json` (regenerated to include it)
- one new database migration
- `src/integrations/supabase/types.ts` (auto-regenerated)

Unchanged: `get-my-weekly-411.ts`, the other tools, and the 4-1-1 page.

## Note on visibility

The new fields will be stored and readable, but the 4-1-1 page won't display leads received, connects, conversations, texts sent, talk time or speed to first touch until we add them to that page — the page currently shows only the fields it already knows about. Say the word and I'll add a follow-up step to surface them next to the existing goals.

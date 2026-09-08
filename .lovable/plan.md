# Weekly 4-1-1 actuals: new MCP write tool

Add one new agent-integration tool, `record_weekly_411_actuals`, so a weekly Follow Up Boss automation can push each agent's activity numbers and database-health numbers into the same weekly 4-1-1 record the accountability tab already reads. The existing read tool is untouched; the page keeps everything it does today and gains a read-only display of the new numbers.

## What I checked

- The weekly 4-1-1 table already stores `dials`, `appointments_set`, `contacts_made`, `database_size`, plus a free-text `notes` field.
- It has **no** place for: leads received, connects, conversations, texts sent, talk time, speed to first touch, contacts held, contacts unstaged, contacts per live deal. Those need to be added.
- There is **no** uniqueness rule on agent + week, so re-running a week today would duplicate rather than overwrite.
- Today only the agent themselves can write their own weekly row; owners/admins can read teammates' rows but not write them. So a controlled server-side write path is required.

## Database changes (one migration)

1. Add nine integer columns: `leads_received`, `connects`, `conversations`, `texts_sent`, `talk_time_minutes`, `speed_to_first_touch_minutes`, `contacts_held`, `contacts_unstaged`, `contacts_per_live_deal` (this last one may be empty when the agent has no live deal). Existing rows are untouched.
2. De-duplicate any pre-existing agent+week duplicates (keep the most recently updated), then add a uniqueness rule on agent + week start.
3. Add a server-side function that runs with elevated rights but only after verifying the caller is an owner or admin **and** that the target agent belongs to the caller's own brokerage. It resolves the agent by email within that brokerage, then inserts or updates that agent's week row, writing only the actuals fields and the optional note. Goals, priorities, wins and anything the agent typed are never overwritten.
4. Access rules on the 4-1-1 table stay exactly as they are — the new function is the only new write path.

## Tool behaviour

- Name: `record_weekly_411_actuals`, title "Record weekly 4-1-1 actuals".
- Inputs: `agent_email` (required), `week_start` (required ISO date, normalised to the week's Monday), an `actuals` object with all eleven integer fields (each optional), and an optional `note`.
- Write tool, not destructive, idempotent per agent + week.
- Rejects unauthenticated calls; the caller's own permissions decide the outcome.
- Response confirms agent, week, created vs updated, and which fields were written.

## Unmatched `agent_email`

No row is created and nothing is guessed. The tool returns a clear error: the email is not an agent in your brokerage. The message is deliberately identical whether the email is unknown entirely or belongs to another brokerage, so the tool can't be used to probe for accounts elsewhere. A batch run can skip that agent and continue.

## 4-1-1 tab display

On the weekly accountability tab, next to the existing "Weekly Activity Tracking" numbers, add a "Database Health" card showing contacts held, contacts unstaged and contacts per live deal, plus the automation's activity numbers (leads received, connects, conversations, texts sent, talk time, speed to first touch). These come from the weekly automation, so they are shown as read-only values with a short "from Follow Up Boss" caption, and an em dash when a value is empty. Nothing the agent already edits changes behaviour.

## Files touched

- `src/lib/mcp/tools/record-weekly-411-actuals.ts` (new)
- `src/lib/mcp/index.ts` — register the tool
- `.lovable/mcp/manifest.json` and `supabase/functions/mcp/index.ts` — regenerated automatically
- `src/pages/FourOneOne.tsx` — new read-only Database Health / automation card
- one new database migration
- `src/integrations/supabase/types.ts` — regenerated after the migration

Unchanged: `get-my-weekly-411.ts`, the other tools, and all existing 4-1-1 reads and saves.

## Migration SQL

```sql
ALTER TABLE public.weekly_411
  ADD COLUMN IF NOT EXISTS leads_received integer,
  ADD COLUMN IF NOT EXISTS connects integer,
  ADD COLUMN IF NOT EXISTS conversations integer,
  ADD COLUMN IF NOT EXISTS texts_sent integer,
  ADD COLUMN IF NOT EXISTS talk_time_minutes integer,
  ADD COLUMN IF NOT EXISTS speed_to_first_touch_minutes integer,
  ADD COLUMN IF NOT EXISTS contacts_held integer,
  ADD COLUMN IF NOT EXISTS contacts_unstaged integer,
  ADD COLUMN IF NOT EXISTS contacts_per_live_deal integer;

-- collapse any existing duplicates, keeping the most recently updated row
DELETE FROM public.weekly_411 a
USING public.weekly_411 b
WHERE a.user_id = b.user_id
  AND a.week_start_date = b.week_start_date
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_411_user_week_uniq
  ON public.weekly_411 (user_id, week_start_date);

CREATE OR REPLACE FUNCTION public.record_weekly_411_actuals(
  _agent_email text,
  _week_start date,
  _actuals jsonb,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_org uuid := public.current_user_org_id();
  _agent_id uuid;
  _week date := date_trunc('week', _week_start)::date;
  _existed boolean;
BEGIN
  IF NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_ONLY';
  END IF;

  SELECT p.id INTO _agent_id
  FROM public.profiles p
  WHERE lower(p.email) = lower(trim(_agent_email))
    AND p.org_id = _caller_org
  LIMIT 1;

  IF _agent_id IS NULL THEN
    RAISE EXCEPTION 'AGENT_NOT_FOUND_IN_ORG';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.weekly_411
    WHERE user_id = _agent_id AND week_start_date = _week
  ) INTO _existed;

  INSERT INTO public.weekly_411 AS w (
    user_id, org_id, week_start_date,
    leads_received, dials, connects, conversations, texts_sent,
    appointments_set, talk_time_minutes, speed_to_first_touch_minutes,
    contacts_held, contacts_unstaged, contacts_per_live_deal, notes
  )
  VALUES (
    _agent_id, _caller_org, _week,
    (_actuals->>'leads_received')::int,
    (_actuals->>'dials')::int,
    (_actuals->>'connects')::int,
    (_actuals->>'conversations')::int,
    (_actuals->>'texts_sent')::int,
    (_actuals->>'appointments_set')::int,
    (_actuals->>'talk_time_minutes')::int,
    (_actuals->>'speed_to_first_touch_minutes')::int,
    (_actuals->>'contacts_held')::int,
    (_actuals->>'contacts_unstaged')::int,
    (_actuals->>'contacts_per_live_deal')::int,
    _note
  )
  ON CONFLICT (user_id, week_start_date) DO UPDATE SET
    leads_received = COALESCE(EXCLUDED.leads_received, w.leads_received),
    dials = COALESCE(EXCLUDED.dials, w.dials),
    connects = COALESCE(EXCLUDED.connects, w.connects),
    conversations = COALESCE(EXCLUDED.conversations, w.conversations),
    texts_sent = COALESCE(EXCLUDED.texts_sent, w.texts_sent),
    appointments_set = COALESCE(EXCLUDED.appointments_set, w.appointments_set),
    talk_time_minutes = COALESCE(EXCLUDED.talk_time_minutes, w.talk_time_minutes),
    speed_to_first_touch_minutes = COALESCE(EXCLUDED.speed_to_first_touch_minutes, w.speed_to_first_touch_minutes),
    contacts_held = COALESCE(EXCLUDED.contacts_held, w.contacts_held),
    contacts_unstaged = COALESCE(EXCLUDED.contacts_unstaged, w.contacts_unstaged),
    contacts_per_live_deal = COALESCE(EXCLUDED.contacts_per_live_deal, w.contacts_per_live_deal),
    notes = COALESCE(EXCLUDED.notes, w.notes),
    updated_at = now();

  RETURN jsonb_build_object(
    'agent_id', _agent_id,
    'week_start_date', _week,
    'action', CASE WHEN _existed THEN 'updated' ELSE 'created' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_weekly_411_actuals(text, date, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_weekly_411_actuals(text, date, jsonb, text) TO authenticated;
```

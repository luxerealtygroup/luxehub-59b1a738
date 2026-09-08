# Weekly 4-1-1 clean-up: one owner per number

Every number on the Weekly tab becomes either measured by Follow Up Boss or entered by the agent — never both. No columns are dropped and no history is deleted.

## What I checked

- `src/pages/FourOneOne.tsx` renders one "Weekly Activity Tracking" card with manual inputs for Contacts Made, Dials, Doors Knocked, Appointments Set, Pipeline Additions, Contracts Signed, Firm Sales and Database Size, plus an auto-calculated Appointments Held, and a second "Database Health" card that currently mixes the three database-health numbers with six activity numbers.
- The page autosaves the whole weekly object. So today a save writes `dials` and `appointments_set` back — that is the collision with the automation.

## The three cards (in this order)

1. **Activity — from Follow Up Boss** (read-only): Leads Received, Dials, Connects, Conversations, Texts Sent, Talk Time, Speed to First Touch, Appointments Set. Caption: "Measured by Follow Up Boss — updates weekly."
2. **Database Health — from Follow Up Boss** (read-only): Contacts Held, Contacts Unstaged, Contacts per Live Deal. Same caption.
3. **Weekly Activity Tracking** (manual): Doors Knocked, Pipeline Additions, Contracts Signed, Firm Sales, plus the existing auto-calculated Appointments Held. Caption: "Things Follow Up Boss can't see — enter these yourself."

Appointments Set and Appointments Held sit next to each other visually (Appointments Set last in card 1, Appointments Held first in card 3) with the line: "Set = booked, counted by Follow Up Boss. Held = actually happened, counted from your appointment records."

Every automated field shows an em dash until the automation writes it.

## Removed inputs

Contacts Made, Dials, Appointments Set and Database Size stop rendering as inputs. Their columns and all past values stay in the database, and the reporting code that already reads them (Team Coaching, reports, the fallback helper) is untouched.

## Changeover — old hand-entered weeks vs automated weeks

Add one marker column, `fub_synced_at` (timestamp, empty for every existing row). The weekly write function stamps it each time it runs. The page then:

- **Stamped week:** shows the automated numbers normally.
- **Un-stamped week with old hand-entered values:** still shows Dials / Appointments Set, but greyed with a small "entered by hand — before automation" note, so nobody mistakes a typed number for a measured one.
- **Un-stamped week with nothing:** em dashes.

This keeps history visible and honest without a data migration or backfill.

## Save-path fix (important)

The autosave currently sends the whole weekly object, so it would keep overwriting the automation's `dials` and `appointments_set` with stale values. The save payload will be narrowed to the fields the agent actually owns (goals, priorities, wins/challenges/next steps, doors knocked, pipeline additions, contracts signed, firm sales, appointments held, notes). Automation-owned columns are never written from the page again.

## Files touched

- `src/pages/FourOneOne.tsx` — three cards, removed inputs, narrowed save payload
- `src/lib/mcp/tools/record-weekly-411-actuals.ts` — no input change; the RPC stamps the sync time
- one migration (below); `src/integrations/supabase/types.ts` regenerated after it

Unchanged: `get-my-weekly-411.ts`, `src/components/Team411.tsx`, `src/lib/utils/weekly411Fallback.ts`, all reports, and the table's access rules.

## Migration

```sql
ALTER TABLE public.weekly_411
  ADD COLUMN IF NOT EXISTS fub_synced_at timestamptz;

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
    contacts_held, contacts_unstaged, contacts_per_live_deal, notes, fub_synced_at
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
    _note, now()
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
    fub_synced_at = now(),
    updated_at = now();

  RETURN jsonb_build_object(
    'agent_id', _agent_id,
    'week_start_date', _week,
    'action', CASE WHEN _existed THEN 'updated' ELSE 'created' END
  );
END;
$$;
```

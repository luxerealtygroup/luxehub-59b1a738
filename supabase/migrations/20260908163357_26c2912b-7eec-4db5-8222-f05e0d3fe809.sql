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
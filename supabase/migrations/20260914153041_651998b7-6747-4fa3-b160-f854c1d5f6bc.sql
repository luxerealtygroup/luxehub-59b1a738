ALTER TABLE public.weekly_411
  ADD COLUMN IF NOT EXISTS new_leads integer,
  ADD COLUMN IF NOT EXISTS leads_claimed_from_pond integer,
  ADD COLUMN IF NOT EXISTS calls_total integer,
  ADD COLUMN IF NOT EXISTS calls_outbound integer,
  ADD COLUMN IF NOT EXISTS calls_connected integer,
  ADD COLUMN IF NOT EXISTS talk_time_seconds integer,
  ADD COLUMN IF NOT EXISTS texts_received integer,
  ADD COLUMN IF NOT EXISTS deals_active integer,
  ADD COLUMN IF NOT EXISTS deals_created integer,
  ADD COLUMN IF NOT EXISTS fub_user_id integer,
  ADD COLUMN IF NOT EXISTS fub_sync_status text,
  ADD COLUMN IF NOT EXISTS fub_sync_error text,
  ADD COLUMN IF NOT EXISTS fub_raw jsonb;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fub_user_email text;

CREATE UNIQUE INDEX IF NOT EXISTS weekly_411_user_week_uniq ON public.weekly_411 (user_id, week_start_date);

CREATE TABLE IF NOT EXISTS public.fub_weekly_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  agents_synced integer NOT NULL DEFAULT 0,
  agents_unmatched integer NOT NULL DEFAULT 0,
  triggered_by uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fub_weekly_sync_runs TO authenticated;
GRANT ALL ON public.fub_weekly_sync_runs TO service_role;

ALTER TABLE public.fub_weekly_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read sync runs in their org" ON public.fub_weekly_sync_runs;
CREATE POLICY "Admins read sync runs in their org"
ON public.fub_weekly_sync_runs FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

CREATE INDEX IF NOT EXISTS fub_weekly_sync_runs_org_week_idx
  ON public.fub_weekly_sync_runs (org_id, week_start DESC, started_at DESC);

DROP TRIGGER IF EXISTS update_fub_weekly_sync_runs_updated_at ON public.fub_weekly_sync_runs;
CREATE TRIGGER update_fub_weekly_sync_runs_updated_at
BEFORE UPDATE ON public.fub_weekly_sync_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- 1. Draft due vs final lock
ALTER TABLE public.planning_settings ADD COLUMN IF NOT EXISTS final_lock_at timestamptz
  DEFAULT ('2026-10-14 12:20:00'::timestamp AT TIME ZONE 'America/Toronto');
UPDATE public.planning_settings SET final_lock_at = ('2026-10-14 12:20:00'::timestamp AT TIME ZONE 'America/Toronto') WHERE final_lock_at IS NULL;

CREATE OR REPLACE FUNCTION public.planning_deadline(_org_id uuid, _year integer)
 RETURNS timestamp with time zone
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT COALESCE(final_lock_at, submission_deadline) FROM public.planning_settings WHERE org_id = _org_id AND plan_year = _year),
    ('2026-10-14 12:20:00'::timestamp AT TIME ZONE 'America/Toronto'))
$function$;
REVOKE EXECUTE ON FUNCTION public.planning_deadline(uuid, integer) FROM PUBLIC, anon, authenticated;

-- 2. Session-exercise answers (Reflection, Goals, Way Forward)
ALTER TABLE public.planning_prework ADD COLUMN IF NOT EXISTS exercises jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Owner-only company plan (explicit viewer list, not role-based)
CREATE TABLE public.company_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_year int NOT NULL DEFAULT 2027,
  allowed_user_ids uuid[] NOT NULL DEFAULT '{}',
  operating_costs numeric NOT NULL DEFAULT 0,
  debt_total numeric NOT NULL DEFAULT 0,
  profit_tiers jsonb NOT NULL DEFAULT '[50000,75000,100000]'::jsonb,
  luxe_revenue_per_deal numeric NOT NULL DEFAULT 0,
  gci_per_deal numeric NOT NULL DEFAULT 0,
  deals_per_agent numeric NOT NULL DEFAULT 10,
  quarterly_checkpoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, plan_year)
);
GRANT SELECT, UPDATE ON public.company_plans TO authenticated;
GRANT ALL ON public.company_plans TO service_role;
ALTER TABLE public.company_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Named owners read company plan" ON public.company_plans FOR SELECT TO authenticated
  USING (auth.uid() = ANY(allowed_user_ids) AND org_id = public.current_user_org_id());
CREATE POLICY "Named owners update company plan" ON public.company_plans FOR UPDATE TO authenticated
  USING (auth.uid() = ANY(allowed_user_ids) AND org_id = public.current_user_org_id())
  WITH CHECK (auth.uid() = ANY(allowed_user_ids) AND org_id = public.current_user_org_id());
CREATE OR REPLACE FUNCTION public.company_plans_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.allowed_user_ids := OLD.allowed_user_ids; NEW.org_id := OLD.org_id; NEW.plan_year := OLD.plan_year;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER company_plans_guard_trg BEFORE UPDATE ON public.company_plans FOR EACH ROW EXECUTE FUNCTION public.company_plans_guard();

-- 4. Live session capture (admins/owners)
CREATE TABLE public.planning_session_capture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_year int NOT NULL DEFAULT 2027,
  lead_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  marketing_calendar jsonb NOT NULL DEFAULT '[]'::jsonb,
  q1_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_time_minutes int,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, plan_year)
);
GRANT SELECT, INSERT, UPDATE ON public.planning_session_capture TO authenticated;
GRANT ALL ON public.planning_session_capture TO service_role;
ALTER TABLE public.planning_session_capture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read session capture" ON public.planning_session_capture FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins insert session capture" ON public.planning_session_capture FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins update session capture" ON public.planning_session_capture FOR UPDATE TO authenticated
  USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()))
  WITH CHECK (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));
CREATE TRIGGER planning_session_capture_updated BEFORE UPDATE ON public.planning_session_capture
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
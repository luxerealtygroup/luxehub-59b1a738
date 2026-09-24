
-- 2027 Business Planning: new additive tables. Existing midyear tables untouched.

CREATE TABLE public.planning_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.current_user_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_year int NOT NULL DEFAULT 2027,
  commission_rate numeric NOT NULL DEFAULT 2.5,
  agent_split_pct numeric NOT NULL DEFAULT 70,
  appt_to_close_rate numeric NOT NULL DEFAULT 20,
  lead_to_appt_rate numeric NOT NULL DEFAULT 10,
  avg_sale_price numeric NOT NULL DEFAULT 800000,
  submission_deadline timestamptz NOT NULL DEFAULT ('2026-10-13 23:59:00'::timestamp AT TIME ZONE 'America/Toronto'),
  planning_session_date date NOT NULL DEFAULT '2026-10-14',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, plan_year)
);
GRANT SELECT, INSERT, UPDATE ON public.planning_settings TO authenticated;
GRANT ALL ON public.planning_settings TO service_role;
ALTER TABLE public.planning_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads planning settings" ON public.planning_settings FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());
CREATE POLICY "Admins insert planning settings" ON public.planning_settings FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins update planning settings" ON public.planning_settings FOR UPDATE TO authenticated
  USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()))
  WITH CHECK (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));
CREATE TRIGGER planning_settings_updated_at BEFORE UPDATE ON public.planning_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.planning_prework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid DEFAULT public.current_user_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_year int NOT NULL DEFAULT 2027,
  wins_2026 text,
  challenges_2026 text,
  top_lead_sources text,
  team_change_suggestion text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, plan_year)
);
GRANT SELECT, INSERT, UPDATE ON public.planning_prework TO authenticated;
GRANT ALL ON public.planning_prework TO service_role;
ALTER TABLE public.planning_prework ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents read own prework" ON public.planning_prework FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id()));
CREATE POLICY "Agents insert own prework" ON public.planning_prework FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents update own prework" ON public.planning_prework FOR UPDATE TO authenticated
  USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

CREATE TABLE public.planning_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid DEFAULT public.current_user_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_year int NOT NULL DEFAULT 2027,
  goal_input_type text NOT NULL DEFAULT 'net' CHECK (goal_input_type IN ('net','gci')),
  net_income_goal numeric,
  gci_goal numeric,
  avg_sale_price numeric,
  commission_rate numeric,
  agent_split_pct numeric,
  appt_to_close_rate numeric,
  lead_to_appt_rate numeric,
  rate_source text,
  gci_per_deal numeric,
  net_per_deal numeric,
  deals_needed int,
  volume_needed numeric,
  appointments_needed int,
  leads_needed int,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
  submitted_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, plan_year)
);
GRANT SELECT, INSERT, UPDATE ON public.planning_goals TO authenticated;
GRANT ALL ON public.planning_goals TO service_role;
ALTER TABLE public.planning_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents read own planning goals" ON public.planning_goals FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id()));
CREATE POLICY "Agents insert own planning goals" ON public.planning_goals FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agents update own planning goals" ON public.planning_goals FOR UPDATE TO authenticated
  USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Admins update team planning goals" ON public.planning_goals FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id())
  WITH CHECK (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

-- Deadline lookup
CREATE OR REPLACE FUNCTION public.planning_deadline(_org_id uuid, _year int)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT submission_deadline FROM public.planning_settings WHERE org_id = _org_id AND plan_year = _year),
    ('2026-10-13 23:59:00'::timestamp AT TIME ZONE 'America/Toronto'))
$$;
REVOKE EXECUTE ON FUNCTION public.planning_deadline(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planning_deadline(uuid, int) TO authenticated, service_role;

-- Goals: compute server-side + enforce status/lock rules
CREATE OR REPLACE FUNCTION public.planning_goals_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin boolean := public.is_admin_or_owner(auth.uid()) AND NEW.org_id IS NOT DISTINCT FROM public.current_user_org_id();
  v_is_self boolean := NEW.agent_id = auth.uid();
  v_deadline timestamptz;
  v_split numeric; v_comm numeric;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.agent_id := OLD.agent_id; NEW.org_id := OLD.org_id; NEW.plan_year := OLD.plan_year;
    END IF;
    v_deadline := public.planning_deadline(NEW.org_id, NEW.plan_year);

    IF NOT v_admin THEN
      IF NEW.status = 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN
        RAISE EXCEPTION 'Only an admin can approve, and approved plans are locked';
      END IF;
      IF now() > v_deadline THEN
        RAISE EXCEPTION 'The submission deadline has passed';
      END IF;
      NEW.approved_by := CASE WHEN TG_OP = 'UPDATE' THEN OLD.approved_by END;
      NEW.approved_at := CASE WHEN TG_OP = 'UPDATE' THEN OLD.approved_at END;
    ELSE
      IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
        NEW.approved_by := auth.uid(); NEW.approved_at := now();
      ELSIF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' THEN
        NEW.status := 'submitted'; NEW.approved_by := NULL; NEW.approved_at := NULL;
      END IF;
      -- Admins reviewing someone else's plan change status only, never the numbers
      IF TG_OP = 'UPDATE' AND NOT v_is_self THEN
        NEW.goal_input_type := OLD.goal_input_type; NEW.net_income_goal := OLD.net_income_goal;
        NEW.gci_goal := OLD.gci_goal; NEW.avg_sale_price := OLD.avg_sale_price;
        NEW.commission_rate := OLD.commission_rate; NEW.agent_split_pct := OLD.agent_split_pct;
        NEW.appt_to_close_rate := OLD.appt_to_close_rate; NEW.lead_to_appt_rate := OLD.lead_to_appt_rate;
        NEW.rate_source := OLD.rate_source;
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    NEW.submitted_at := now();
  ELSIF NEW.status = 'draft' THEN
    NEW.submitted_at := NULL;
  END IF;

  -- Derived numbers (never trusted from the client)
  v_split := NULLIF(NEW.agent_split_pct, 0);
  v_comm := NULLIF(NEW.commission_rate, 0);
  IF NEW.goal_input_type = 'net' THEN
    NEW.gci_goal := CASE WHEN v_split IS NULL OR NEW.net_income_goal IS NULL THEN NULL
                         ELSE round(NEW.net_income_goal / (v_split / 100)) END;
  ELSE
    NEW.net_income_goal := CASE WHEN v_split IS NULL OR NEW.gci_goal IS NULL THEN NULL
                         ELSE round(NEW.gci_goal * (v_split / 100)) END;
  END IF;
  NEW.gci_per_deal := CASE WHEN v_comm IS NULL OR NEW.avg_sale_price IS NULL THEN NULL
                           ELSE round(NEW.avg_sale_price * (v_comm / 100)) END;
  NEW.net_per_deal := CASE WHEN NEW.gci_per_deal IS NULL OR v_split IS NULL THEN NULL
                           ELSE round(NEW.gci_per_deal * (v_split / 100)) END;
  NEW.deals_needed := CASE WHEN COALESCE(NEW.gci_per_deal,0) <= 0 OR NEW.gci_goal IS NULL THEN NULL
                           ELSE ceil(NEW.gci_goal / NEW.gci_per_deal) END;
  NEW.volume_needed := CASE WHEN NEW.deals_needed IS NULL THEN NULL ELSE NEW.deals_needed * NEW.avg_sale_price END;
  NEW.appointments_needed := CASE WHEN NEW.deals_needed IS NULL OR COALESCE(NEW.appt_to_close_rate,0) <= 0 THEN NULL
                           ELSE ceil(NEW.deals_needed / (NEW.appt_to_close_rate / 100)) END;
  NEW.leads_needed := CASE WHEN NEW.appointments_needed IS NULL OR COALESCE(NEW.lead_to_appt_rate,0) <= 0 THEN NULL
                           ELSE ceil(NEW.appointments_needed / (NEW.lead_to_appt_rate / 100)) END;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.planning_goals_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER planning_goals_guard BEFORE INSERT OR UPDATE ON public.planning_goals
  FOR EACH ROW EXECUTE FUNCTION public.planning_goals_guard();

-- Pre-work: locked after the deadline or once the goal is approved
CREATE OR REPLACE FUNCTION public.planning_prework_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.agent_id := OLD.agent_id; NEW.org_id := OLD.org_id; NEW.plan_year := OLD.plan_year;
    END IF;
    IF now() > public.planning_deadline(NEW.org_id, NEW.plan_year) THEN
      RAISE EXCEPTION 'The submission deadline has passed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.planning_goals g WHERE g.agent_id = NEW.agent_id
               AND g.plan_year = NEW.plan_year AND g.status = 'approved') THEN
      RAISE EXCEPTION 'This plan has been approved and is locked';
    END IF;
  END IF;
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    NEW.submitted_at := now();
  ELSIF NEW.status = 'draft' THEN
    NEW.submitted_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.planning_prework_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER planning_prework_guard BEFORE INSERT OR UPDATE ON public.planning_prework
  FOR EACH ROW EXECUTE FUNCTION public.planning_prework_guard();

-- Seed-free: the settings row is created by an admin (or falls back to defaults in the app)

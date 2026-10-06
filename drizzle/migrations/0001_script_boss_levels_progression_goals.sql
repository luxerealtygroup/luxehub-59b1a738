-- Levels config (per brokerage, owner-editable)
CREATE TABLE public.script_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  pass_pct integer NOT NULL DEFAULT 80 CHECK (pass_pct BETWEEN 1 AND 100),
  passes_required integer NOT NULL DEFAULT 3 CHECK (passes_required BETWEEN 1 AND 50),
  persona_prompt text NOT NULL DEFAULT '',
  grading_notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (org_id, level)
);
GRANT SELECT, UPDATE ON public.script_levels TO authenticated;
GRANT ALL ON public.script_levels TO service_role;
ALTER TABLE public.script_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Script Boss users read levels" ON public.script_levels FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND (public.can_use_script_boss(auth.uid()) OR public.is_admin_or_owner(auth.uid())));
CREATE POLICY "Admins update levels" ON public.script_levels FOR UPDATE TO authenticated
  USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()))
  WITH CHECK (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));

-- Scenario level
ALTER TABLE public.script_boss_scenarios ADD COLUMN IF NOT EXISTS level smallint CHECK (level BETWEEN 1 AND 5);
UPDATE public.script_boss_scenarios SET level = CASE
  WHEN number IN (19,20,8,5,16,31) THEN 1
  WHEN number IN (1,2,3,4,10,11,12,14,15,17,24,27,28,30) THEN 2
  WHEN number IN (6,7,9,18,25,26,29,32) THEN 3
  WHEN number IN (13,21,22) THEN 4
  WHEN number IN (23,33,34) THEN 5
  ELSE level END
WHERE level IS NULL AND number IS NOT NULL;

-- Session level (live drill)
ALTER TABLE public.script_boss_sessions ADD COLUMN IF NOT EXISTS level smallint CHECK (level BETWEEN 1 AND 5);

-- Practice results: nullable, old rows untouched
ALTER TABLE public.practice_sessions ADD COLUMN IF NOT EXISTS level smallint CHECK (level BETWEEN 1 AND 5);
ALTER TABLE public.practice_sessions ADD COLUMN IF NOT EXISTS score_pct integer;
ALTER TABLE public.practice_sessions ADD COLUMN IF NOT EXISTS passed boolean;

-- Only the trusted server path may set level / score_pct / passed
CREATE OR REPLACE FUNCTION public.guard_practice_level_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.level := NULL; NEW.score_pct := NULL; NEW.passed := NULL;
  ELSE
    NEW.level := OLD.level; NEW.score_pct := OLD.score_pct; NEW.passed := OLD.passed;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER practice_sessions_guard_level
BEFORE INSERT OR UPDATE ON public.practice_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_practice_level_fields();

-- Unlocks (written only by the server)
CREATE TABLE public.level_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 2 AND 5),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  unlocked_by text NOT NULL DEFAULT 'system',
  note text,
  UNIQUE (agent_id, level)
);
GRANT SELECT ON public.level_unlocks TO authenticated;
GRANT ALL ON public.level_unlocks TO service_role;
ALTER TABLE public.level_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or admin read unlocks" ON public.level_unlocks FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND (agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid())));

-- Goals
CREATE TABLE public.practice_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.current_user_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  goal_type text NOT NULL CHECK (goal_type IN ('clear_levels','reach_level','passes_in_period')),
  target integer NOT NULL CHECK (target BETWEEN 1 AND 500),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','missed','cancelled')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_goals TO authenticated;
GRANT ALL ON public.practice_goals TO service_role;
ALTER TABLE public.practice_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or admin read goals" ON public.practice_goals FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND (agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid())));
CREATE POLICY "Own or admin create goals" ON public.practice_goals FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id() AND public.user_in_my_org(agent_id)
    AND (agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid())));
CREATE POLICY "Own or admin update goals" ON public.practice_goals FOR UPDATE TO authenticated
  USING (org_id = public.current_user_org_id() AND (agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid())))
  WITH CHECK (org_id = public.current_user_org_id() AND public.user_in_my_org(agent_id) AND (agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid())));
CREATE POLICY "Own or admin delete goals" ON public.practice_goals FOR DELETE TO authenticated
  USING (org_id = public.current_user_org_id() AND (agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid())));
CREATE TRIGGER practice_goals_updated_at BEFORE UPDATE ON public.practice_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
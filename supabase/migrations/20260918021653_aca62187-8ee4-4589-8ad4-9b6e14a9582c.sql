ALTER TABLE public.production_goals ADD COLUMN IF NOT EXISTS monthly_plan jsonb;
ALTER TABLE public.production_goals ADD COLUMN IF NOT EXISTS plan_assumptions jsonb;

CREATE TABLE IF NOT EXISTS public.agent_goal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  agent_user_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  year integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.agent_goal_audit TO authenticated;
GRANT ALL ON public.agent_goal_audit TO service_role;

ALTER TABLE public.agent_goal_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents and admins view goal audit in their org"
ON public.agent_goal_audit FOR SELECT TO authenticated
USING (org_id = public.current_user_org_id()
  AND (agent_user_id = auth.uid() OR public.is_admin_or_owner(auth.uid())));

CREATE POLICY "Users insert goal audit in their org"
ON public.agent_goal_audit FOR INSERT TO authenticated
WITH CHECK (changed_by = auth.uid()
  AND org_id = public.current_user_org_id()
  AND (agent_user_id = auth.uid() OR public.is_admin_or_owner(auth.uid())));

CREATE INDEX IF NOT EXISTS idx_agent_goal_audit_agent ON public.agent_goal_audit (agent_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_goal_audit_org ON public.agent_goal_audit (org_id);

CREATE TRIGGER set_org_id_on_insert
BEFORE INSERT ON public.agent_goal_audit
FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_context();

CREATE POLICY "Admins insert production goals in their org"
ON public.production_goals FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

CREATE POLICY "Admins update production goals in their org"
ON public.production_goals FOR UPDATE TO authenticated
USING (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id())
WITH CHECK (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());
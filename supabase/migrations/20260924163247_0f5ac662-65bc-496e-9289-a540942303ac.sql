ALTER TABLE public.planning_prework
  ADD COLUMN IF NOT EXISTS stop_start_continue text,
  ADD COLUMN IF NOT EXISTS support_needed text,
  ADD COLUMN IF NOT EXISTS recap_wins text,
  ADD COLUMN IF NOT EXISTS recap_challenges text,
  ADD COLUMN IF NOT EXISTS recap_commitments text,
  ADD COLUMN IF NOT EXISTS recap_lead_sources text,
  ADD COLUMN IF NOT EXISTS weekly_conversations integer,
  ADD COLUMN IF NOT EXISTS weekly_appointments integer,
  ADD COLUMN IF NOT EXISTS weekly_leads integer,
  ADD COLUMN IF NOT EXISTS lead_source_focus jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quarterly_milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS action_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS skills_focus text,
  ADD COLUMN IF NOT EXISTS personal_goal text;

ALTER TABLE public.planning_settings
  ADD COLUMN IF NOT EXISTS selling_agent_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS defaults_source text;

CREATE TABLE public.planning_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_year integer NOT NULL DEFAULT 2027,
  wins text,
  challenges text,
  commitments text,
  lead_sources text,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, plan_year)
);
GRANT SELECT ON public.planning_recaps TO authenticated;
GRANT ALL ON public.planning_recaps TO service_role;
ALTER TABLE public.planning_recaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents read own recap, admins read org recaps" ON public.planning_recaps
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id()));
CREATE TRIGGER planning_recaps_updated_at BEFORE UPDATE ON public.planning_recaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
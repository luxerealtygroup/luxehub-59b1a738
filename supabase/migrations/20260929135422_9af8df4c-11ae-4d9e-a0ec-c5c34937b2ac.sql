ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pasted',
  ADD COLUMN IF NOT EXISTS transcript jsonb,
  ADD COLUMN IF NOT EXISTS agent_talk_pct integer,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS script_boss_session_id uuid;

CREATE TABLE public.script_boss_trainees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT current_user_org_id(),
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  monthly_cap_usd numeric,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.script_boss_trainees TO authenticated;
GRANT ALL ON public.script_boss_trainees TO service_role;
ALTER TABLE public.script_boss_trainees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or admin read trainee flag" ON public.script_boss_trainees FOR SELECT TO authenticated
  USING (org_id = current_user_org_id() AND (user_id = auth.uid() OR is_admin_or_owner(auth.uid())));
CREATE POLICY "Admins manage trainee flag" ON public.script_boss_trainees FOR ALL TO authenticated
  USING (org_id = current_user_org_id() AND is_admin_or_owner(auth.uid()))
  WITH CHECK (org_id = current_user_org_id() AND is_admin_or_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.can_use_script_boss(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role IN ('agent','admin','owner','operations'))
      OR EXISTS (SELECT 1 FROM script_boss_trainees t JOIN profiles p ON p.id = t.user_id
                 WHERE t.user_id = _uid AND t.enabled AND t.org_id = p.org_id)
$$;

CREATE TABLE public.script_boss_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT current_user_org_id(),
  version integer NOT NULL,
  content text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, version)
);
GRANT SELECT, INSERT ON public.script_boss_instructions TO authenticated;
GRANT ALL ON public.script_boss_instructions TO service_role;
ALTER TABLE public.script_boss_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read instructions" ON public.script_boss_instructions FOR SELECT TO authenticated
  USING (org_id = current_user_org_id() AND is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins add instruction versions" ON public.script_boss_instructions FOR INSERT TO authenticated
  WITH CHECK (org_id = current_user_org_id() AND is_admin_or_owner(auth.uid()) AND created_by = auth.uid());

CREATE TABLE public.script_boss_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT current_user_org_id(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_custom boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.script_boss_scenarios TO authenticated;
GRANT ALL ON public.script_boss_scenarios TO service_role;
ALTER TABLE public.script_boss_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users with access read scenarios" ON public.script_boss_scenarios FOR SELECT TO authenticated
  USING (org_id = current_user_org_id() AND (can_use_script_boss(auth.uid()) OR is_admin_or_owner(auth.uid())));
CREATE POLICY "Admins insert scenarios" ON public.script_boss_scenarios FOR INSERT TO authenticated
  WITH CHECK (org_id = current_user_org_id() AND is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins update scenarios" ON public.script_boss_scenarios FOR UPDATE TO authenticated
  USING (org_id = current_user_org_id() AND is_admin_or_owner(auth.uid()))
  WITH CHECK (org_id = current_user_org_id() AND is_admin_or_owner(auth.uid()));

CREATE TABLE public.script_boss_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  scenario_id uuid,
  scenario_name text NOT NULL,
  custom_situation text,
  difficulty text NOT NULL CHECK (difficulty IN ('Friendly','Skeptical','Tough')),
  mode text NOT NULL DEFAULT 'voice' CHECK (mode IN ('voice','text')),
  instructions_version integer,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','scored','abandoned')),
  practice_session_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX script_boss_sessions_user_idx ON public.script_boss_sessions (user_id, started_at DESC);
GRANT SELECT ON public.script_boss_sessions TO authenticated;
GRANT ALL ON public.script_boss_sessions TO service_role;
ALTER TABLE public.script_boss_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or admin read sessions" ON public.script_boss_sessions FOR SELECT TO authenticated
  USING (org_id = current_user_org_id() AND (user_id = auth.uid() OR is_admin_or_owner(auth.uid())));

CREATE TABLE public.script_boss_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid,
  kind text NOT NULL,
  units numeric NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX script_boss_usage_user_idx ON public.script_boss_usage (org_id, user_id, created_at DESC);
GRANT SELECT ON public.script_boss_usage TO authenticated;
GRANT ALL ON public.script_boss_usage TO service_role;
ALTER TABLE public.script_boss_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or admin read usage" ON public.script_boss_usage FOR SELECT TO authenticated
  USING (org_id = current_user_org_id() AND (user_id = auth.uid() OR is_admin_or_owner(auth.uid())));

-- Seed default scenarios for every org
INSERT INTO public.script_boss_scenarios (org_id, name, description, is_custom, sort_order)
SELECT o.id, s.name, s.description, s.is_custom, s.ord FROM public.organizations o
CROSS JOIN (VALUES
  ('Expired listing','Homeowner whose listing just expired on MLS without selling; frustrated with their last agent.', false, 1),
  ('FSBO','Homeowner selling privately (For Sale By Owner) who wants to save the commission.', false, 2),
  ('Open house follow-up','Visitor who signed in at your open house last weekend.', false, 3),
  ('Buyer consultation','Buyer considering working with you; first sit-down or call.', false, 4),
  ('Listing appointment','Seller interviewing agents to list their home.', false, 5),
  ('Sphere check-in','Someone from your personal sphere; friendly catch-up with a real-estate angle.', false, 6),
  ('Past-client reactivation','Past client you helped buy or sell a few years ago; you have not spoken in a while.', false, 7),
  ('Realtor.ca inquiry','Lead who just inquired about a specific listing on Realtor.ca.', false, 8),
  ('Custom','The agent describes the situation.', true, 99)
) AS s(name, description, is_custom, ord);

-- Brody: trainee flag on
INSERT INTO public.script_boss_trainees (org_id, user_id, enabled)
SELECT org_id, id, true FROM public.profiles WHERE id = 'd007b820-7e08-4425-87a5-20d3f93afef3' AND org_id IS NOT NULL
ON CONFLICT (org_id, user_id) DO NOTHING;
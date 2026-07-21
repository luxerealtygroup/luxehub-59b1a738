
-- Note: the "agents" table in this project is public.profiles (each profile row is an agent user).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coaching_history_seed text;

CREATE TABLE public.coaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_of date NOT NULL,
  transcript_text text NOT NULL,
  generated_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coaching_sessions_agent_week_idx
  ON public.coaching_sessions (agent_id, week_of);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_sessions TO authenticated;
GRANT ALL ON public.coaching_sessions TO service_role;

ALTER TABLE public.coaching_sessions ENABLE ROW LEVEL SECURITY;

-- Admins/owners: full read/write
CREATE POLICY "Admins can view all coaching sessions"
  ON public.coaching_sessions FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can insert coaching sessions"
  ON public.coaching_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update coaching sessions"
  ON public.coaching_sessions FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Agents: read-only access to their own rows
CREATE POLICY "Agents can view their own coaching sessions"
  ON public.coaching_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = agent_id);

-- profiles.coaching_history_seed access:
-- Existing profiles policies already allow team members to view profiles and
-- users to update their own profile. Add an admin-update policy so admins can
-- write coaching_history_seed on any agent. Column-level restriction is enforced
-- in the app layer; RLS controls row-level write access.
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

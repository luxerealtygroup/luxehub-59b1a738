CREATE TABLE public.org_preview_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '60 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.org_preview_sessions TO authenticated;
GRANT ALL ON public.org_preview_sessions TO service_role;

ALTER TABLE public.org_preview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins view own preview sessions"
  ON public.org_preview_sessions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) AND actor_id = auth.uid());

CREATE POLICY "super admins start preview sessions"
  ON public.org_preview_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) AND actor_id = auth.uid());

CREATE POLICY "super admins end own preview sessions"
  ON public.org_preview_sessions FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) AND actor_id = auth.uid())
  WITH CHECK (public.is_super_admin(auth.uid()) AND actor_id = auth.uid());

CREATE INDEX idx_org_preview_sessions_actor ON public.org_preview_sessions(actor_id, started_at DESC);

CREATE TRIGGER update_org_preview_sessions_updated_at
  BEFORE UPDATE ON public.org_preview_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1. STORAGE: client-documents bucket — remove overly broad SELECT
DROP POLICY IF EXISTS "Agents can view client documents" ON storage.objects;

-- 2. REALTIME: lock down realtime.messages to authenticated only
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can use Realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can use Realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 3. DEAL PARTICIPANTS: co-agents only see own row; owners/admins see all
DROP POLICY IF EXISTS "Users can view deals they participate in" ON public.deal_participants;
CREATE POLICY "Participants see own row, owners see all"
  ON public.deal_participants
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR deal_id IN (SELECT id FROM public.deals WHERE user_id = auth.uid())
    OR public.is_admin_or_owner(auth.uid())
  );

-- 4. is_team_member: role allowlist
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner','admin','agent','planning_access')
  )
$$;

-- 5. Revoke EXECUTE on SECURITY DEFINER functions from anon
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_owner(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_client(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_demo_account(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_cma_version(uuid) FROM anon;

-- 6. Move pg_net out of public schema (drop + recreate, not used by app code)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- 7. fub_webhook_events table
CREATE TABLE public.fub_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  resource_ids jsonb,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fub_webhook_events TO authenticated;
GRANT ALL ON public.fub_webhook_events TO service_role;

ALTER TABLE public.fub_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fub webhook events"
  ON public.fub_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE INDEX idx_fub_webhook_events_received_at ON public.fub_webhook_events(received_at DESC);
CREATE INDEX idx_fub_webhook_events_event_type ON public.fub_webhook_events(event_type);

ALTER PUBLICATION supabase_realtime ADD TABLE public.fub_webhook_events;

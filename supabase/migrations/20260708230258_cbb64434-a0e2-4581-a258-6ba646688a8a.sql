
DO $$ BEGIN
  CREATE TYPE public.portal_message_sender AS ENUM ('client','agent','ops');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  sender_type public.portal_message_sender NOT NULL,
  sender_name TEXT,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message_body TEXT NOT NULL,
  slack_ts TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX portal_messages_portal_created_idx
  ON public.portal_messages (portal_id, created_at);
CREATE INDEX portal_messages_slack_ts_idx
  ON public.portal_messages (slack_ts) WHERE slack_ts IS NOT NULL;

GRANT SELECT, INSERT ON public.portal_messages TO authenticated;
GRANT ALL ON public.portal_messages TO service_role;

ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portal chat readable by team or owning client"
  ON public.portal_messages FOR SELECT
  TO authenticated
  USING (
    public.is_team_member(auth.uid())
    OR public.owns_portal(portal_id, auth.uid())
  );

CREATE POLICY "Portal chat insertable by team or owning client"
  ON public.portal_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_team_member(auth.uid())
    OR public.owns_portal(portal_id, auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_messages;
ALTER TABLE public.portal_messages REPLICA IDENTITY FULL;

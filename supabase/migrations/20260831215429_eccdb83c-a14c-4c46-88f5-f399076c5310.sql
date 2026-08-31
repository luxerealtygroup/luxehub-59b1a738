-- Slack -> portal publishing: visibility flag + audit trail.

ALTER TABLE public.portal_messages
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.portal_properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_slack_channel_id text,
  ADD COLUMN IF NOT EXISTS source_slack_ts text,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.portal_timeline_notes
  ADD COLUMN IF NOT EXISTS source_slack_channel_id text,
  ADD COLUMN IF NOT EXISTS source_slack_ts text,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- One Slack message can only be published once per destination table.
CREATE UNIQUE INDEX IF NOT EXISTS portal_messages_slack_source_uniq
  ON public.portal_messages (source_slack_channel_id, source_slack_ts)
  WHERE source_slack_ts IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS portal_timeline_notes_slack_source_uniq
  ON public.portal_timeline_notes (source_slack_channel_id, source_slack_ts)
  WHERE source_slack_ts IS NOT NULL;

-- Clients must never read internal chat rows. Enforced in RLS, not just the UI.
DROP POLICY IF EXISTS "Portal chat readable by team or owning client" ON public.portal_messages;
CREATE POLICY "Portal chat readable by team or owning client"
  ON public.portal_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_team_member(auth.uid())
    OR (public.owns_portal(portal_id, auth.uid()) AND is_internal = false)
  );

-- Enables the unpublish / publish toggle in the portal admin.
DROP POLICY IF EXISTS "Team can update portal chat" ON public.portal_messages;
CREATE POLICY "Team can update portal chat"
  ON public.portal_messages
  FOR UPDATE
  TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.portal_messages TO authenticated;
GRANT ALL ON public.portal_messages TO service_role;
GRANT ALL ON public.portal_timeline_notes TO service_role;
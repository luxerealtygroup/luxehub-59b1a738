-- Extend client_accounts with portal-specific fields
ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS client_type text CHECK (client_type IN ('buyer','seller')),
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS slack_channel_id text;

-- Extend client_tasks with explicit status + notes
ALTER TABLE public.client_tasks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete')),
  ADD COLUMN IF NOT EXISTS notes text;

-- New table: portal_timeline_notes (agent notes attached to a FUB stage)
CREATE TABLE IF NOT EXISTS public.portal_timeline_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_timeline_notes TO authenticated;
GRANT ALL ON public.portal_timeline_notes TO service_role;

ALTER TABLE public.portal_timeline_notes ENABLE ROW LEVEL SECURITY;

-- Agents (who invited the client) and owners/admins can manage notes
CREATE POLICY "Agents manage timeline notes for their clients"
  ON public.portal_timeline_notes
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR client_account_id IN (
      SELECT id FROM public.client_accounts
      WHERE invited_by = auth.uid()
    )
    OR public.is_admin_or_owner(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR client_account_id IN (
      SELECT id FROM public.client_accounts
      WHERE invited_by = auth.uid()
    )
    OR public.is_admin_or_owner(auth.uid())
  );

-- Clients can view notes on their own portal
CREATE POLICY "Clients view their timeline notes"
  ON public.portal_timeline_notes
  FOR SELECT
  TO authenticated
  USING (
    client_account_id IN (
      SELECT id FROM public.client_accounts WHERE user_id = auth.uid()
    )
  );

CREATE TRIGGER update_portal_timeline_notes_updated_at
  BEFORE UPDATE ON public.portal_timeline_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS portal_timeline_notes_client_idx
  ON public.portal_timeline_notes(client_account_id, created_at DESC);
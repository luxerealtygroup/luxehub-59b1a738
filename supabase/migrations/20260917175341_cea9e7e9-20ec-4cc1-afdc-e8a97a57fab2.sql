ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid;

UPDATE public.client_accounts
  SET assigned_agent_id = invited_by
  WHERE assigned_agent_id IS NULL AND invited_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_accounts_assigned_agent_idx
  ON public.client_accounts (assigned_agent_id);

-- Additive: assigned agent gets the same read/update reach as the inviting agent.
CREATE POLICY "Assigned agent views their portals"
ON public.client_accounts FOR SELECT
TO authenticated
USING (assigned_agent_id = auth.uid() AND org_id = public.current_user_org_id());

CREATE POLICY "Assigned agent updates their portals"
ON public.client_accounts FOR UPDATE
TO authenticated
USING (assigned_agent_id = auth.uid() AND org_id = public.current_user_org_id())
WITH CHECK (assigned_agent_id = auth.uid() AND org_id = public.current_user_org_id());

-- Portal child records (documents, photos, messages, transactions, ...) all route
-- through can_access_portal; widen it to the assigned agent too.
CREATE OR REPLACE FUNCTION public.can_access_portal(_portal_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_accounts ca
    WHERE ca.id = _portal_id
      AND ca.org_id IS NOT NULL
      AND ca.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = _user_id)
      AND (
        public.is_admin_or_owner(_user_id)
        OR ca.invited_by = _user_id
        OR ca.assigned_agent_id = _user_id
      )
  );
$$;
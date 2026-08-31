ALTER TABLE public.portal_documents ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
ALTER TABLE public.portal_timeline_notes ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
ALTER TABLE public.client_tasks ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "portal_documents select" ON public.portal_documents;
CREATE POLICY "portal_documents select" ON public.portal_documents
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'owner'::app_role)
  OR is_team_member(auth.uid())
  OR (owns_portal(portal_id, auth.uid()) AND is_internal = false)
);

DROP POLICY IF EXISTS "Clients view their timeline notes" ON public.portal_timeline_notes;
CREATE POLICY "Clients view their timeline notes" ON public.portal_timeline_notes
FOR SELECT TO authenticated
USING (
  is_internal = false
  AND client_account_id IN (
    SELECT client_accounts.id FROM public.client_accounts WHERE client_accounts.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Clients can view their tasks" ON public.client_tasks;
CREATE POLICY "Clients can view their tasks" ON public.client_tasks
FOR SELECT
USING (
  is_internal = false
  AND client_account_id IN (
    SELECT client_accounts.id FROM public.client_accounts WHERE client_accounts.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Clients can update their tasks" ON public.client_tasks;
CREATE POLICY "Clients can update their tasks" ON public.client_tasks
FOR UPDATE
USING (
  is_internal = false
  AND client_account_id IN (
    SELECT client_accounts.id FROM public.client_accounts WHERE client_accounts.user_id = auth.uid()
  )
)
WITH CHECK (
  is_internal = false
  AND client_account_id IN (
    SELECT client_accounts.id FROM public.client_accounts WHERE client_accounts.user_id = auth.uid()
  )
);
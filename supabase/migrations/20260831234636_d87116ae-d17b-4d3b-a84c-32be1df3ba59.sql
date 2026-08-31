-- Helper: is this user the assigned agent for the portal (or an admin/owner)?
CREATE OR REPLACE FUNCTION public.can_access_portal(_portal_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_or_owner(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.client_accounts ca
        WHERE ca.id = _portal_id
          AND ca.invited_by = _user_id
      );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_portal(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- documents
DROP POLICY IF EXISTS "portal_documents select" ON public.portal_documents;
CREATE POLICY "portal_documents select" ON public.portal_documents
FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR (public.owns_portal(portal_id, auth.uid()) AND is_internal = false)
);

-- ------------------------------------------------------------------- photos
DROP POLICY IF EXISTS "portal_photos select" ON public.portal_photos;
CREATE POLICY "portal_photos select" ON public.portal_photos
FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);

-- ----------------------------------------------------------------- messages
DROP POLICY IF EXISTS "Portal chat readable by team or owning client" ON public.portal_messages;
CREATE POLICY "Portal chat readable by assigned agent or owning client" ON public.portal_messages
FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR (public.owns_portal(portal_id, auth.uid()) AND is_internal = false)
);

DROP POLICY IF EXISTS "Portal chat insertable by team or owning client" ON public.portal_messages;
CREATE POLICY "Portal chat insertable by assigned agent or owning client" ON public.portal_messages
FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_portal(portal_id, auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);

DROP POLICY IF EXISTS "Team can update portal chat" ON public.portal_messages;
CREATE POLICY "Assigned agent can update portal chat" ON public.portal_messages
FOR UPDATE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()))
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

-- --------------------------------------------------------------- properties
DROP POLICY IF EXISTS "portal_properties select" ON public.portal_properties;
CREATE POLICY "portal_properties select" ON public.portal_properties
FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);

DROP POLICY IF EXISTS "portal_properties insert" ON public.portal_properties;
CREATE POLICY "portal_properties insert" ON public.portal_properties
FOR INSERT TO authenticated
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "portal_properties update" ON public.portal_properties;
CREATE POLICY "portal_properties update" ON public.portal_properties
FOR UPDATE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()))
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "portal_properties delete" ON public.portal_properties;
CREATE POLICY "portal_properties delete" ON public.portal_properties
FOR DELETE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()));

-- ------------------------------------------------------------- transactions
DROP POLICY IF EXISTS "portal_transactions select" ON public.portal_transactions;
CREATE POLICY "portal_transactions select" ON public.portal_transactions
FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);

DROP POLICY IF EXISTS "portal_transactions insert" ON public.portal_transactions;
CREATE POLICY "portal_transactions insert" ON public.portal_transactions
FOR INSERT TO authenticated
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "portal_transactions update" ON public.portal_transactions;
CREATE POLICY "portal_transactions update" ON public.portal_transactions
FOR UPDATE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()))
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "portal_transactions delete" ON public.portal_transactions;
CREATE POLICY "portal_transactions delete" ON public.portal_transactions
FOR DELETE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()));

-- --------------------------------------------------------------- conditions
DROP POLICY IF EXISTS "conditions select" ON public.portal_transaction_conditions;
CREATE POLICY "conditions select" ON public.portal_transaction_conditions
FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);

DROP POLICY IF EXISTS "conditions insert" ON public.portal_transaction_conditions;
CREATE POLICY "conditions insert" ON public.portal_transaction_conditions
FOR INSERT TO authenticated
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "conditions update" ON public.portal_transaction_conditions;
CREATE POLICY "conditions update" ON public.portal_transaction_conditions
FOR UPDATE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()))
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "conditions delete" ON public.portal_transaction_conditions;
CREATE POLICY "conditions delete" ON public.portal_transaction_conditions
FOR DELETE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()));

-- ---------------------------------------------------------- condition notes
DROP POLICY IF EXISTS "condition notes select" ON public.portal_condition_notes;
CREATE POLICY "condition notes select" ON public.portal_condition_notes
FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR (public.owns_portal(portal_id, auth.uid()) AND is_internal = false)
);

DROP POLICY IF EXISTS "condition notes insert" ON public.portal_condition_notes;
CREATE POLICY "condition notes insert" ON public.portal_condition_notes
FOR INSERT TO authenticated
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "condition notes update" ON public.portal_condition_notes;
CREATE POLICY "condition notes update" ON public.portal_condition_notes
FOR UPDATE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()))
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "condition notes delete" ON public.portal_condition_notes;
CREATE POLICY "condition notes delete" ON public.portal_condition_notes
FOR DELETE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()));

-- -------------------------------------------------------------- client tasks
DROP POLICY IF EXISTS "Agents can manage tasks" ON public.client_tasks;
CREATE POLICY "Assigned agents can manage tasks" ON public.client_tasks
FOR ALL TO authenticated
USING (
  assigned_by = auth.uid()
  OR public.can_access_portal(client_account_id, auth.uid())
)
WITH CHECK (
  assigned_by = auth.uid()
  OR public.can_access_portal(client_account_id, auth.uid())
);
-- Notifications: scope admin/owner visibility to their own organization.
DROP POLICY IF EXISTS "Users read their notifications; admins read all" ON public.notifications;
DROP POLICY IF EXISTS "Users mark their notifications; admins mark any" ON public.notifications;
DROP POLICY IF EXISTS "Users delete their notifications; admins delete any" ON public.notifications;

CREATE POLICY "Users read their notifications; admins read their org"
ON public.notifications FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
);

CREATE POLICY "Users mark their notifications; admins mark their org"
ON public.notifications FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
)
WITH CHECK (
  auth.uid() = user_id
  OR (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
);

CREATE POLICY "Users delete their notifications; admins delete their org"
ON public.notifications FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR (is_admin_or_owner(auth.uid()) AND org_id = current_user_org_id())
);

-- Portal access request log carries no tenant, so no team admin should read it.
DROP POLICY IF EXISTS "Admins read portal access requests" ON public.portal_access_requests;

CREATE POLICY "Platform operator reads portal access requests"
ON public.portal_access_requests FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()));

-- Internal-only helpers should not be callable by signed-out visitors.
REVOKE EXECUTE ON FUNCTION public.guard_profile_org_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_operations(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_operations(uuid) TO authenticated;
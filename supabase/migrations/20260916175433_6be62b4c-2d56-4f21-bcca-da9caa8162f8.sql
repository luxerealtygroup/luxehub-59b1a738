-- Operations counts as company-wide staff for access checks.
CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'owner'::public.app_role, 'operations'::public.app_role)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_operations(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'operations'::public.app_role
  )
$$;

-- Client portal accounts: route admin-style checks through is_admin_or_owner
DROP POLICY IF EXISTS "Admins and owners view all client accounts" ON public.client_accounts;
CREATE POLICY "Admins and owners view all client accounts"
ON public.client_accounts FOR SELECT
USING (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Admins insert client accounts" ON public.client_accounts;
CREATE POLICY "Admins insert client accounts"
ON public.client_accounts FOR INSERT
WITH CHECK (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Agents update their invited clients; admins/owners update any" ON public.client_accounts;
CREATE POLICY "Agents update their invited clients; admins/owners update any"
ON public.client_accounts FOR UPDATE
USING ((auth.uid() = invited_by OR public.is_admin_or_owner(auth.uid())) AND org_id = public.current_user_org_id());

-- Notifications
DROP POLICY IF EXISTS "Users read their notifications; admins read all" ON public.notifications;
CREATE POLICY "Users read their notifications; admins read all"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Users mark their notifications; admins mark any" ON public.notifications;
CREATE POLICY "Users mark their notifications; admins mark any"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Users delete their notifications; admins delete any" ON public.notifications;
CREATE POLICY "Users delete their notifications; admins delete any"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

-- Marie Zinger becomes Operations (and is no longer a plain admin).
INSERT INTO public.user_roles (user_id, role)
VALUES ('c5a091be-4da0-4aeb-8dc4-7de0035ea9f2', 'operations'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
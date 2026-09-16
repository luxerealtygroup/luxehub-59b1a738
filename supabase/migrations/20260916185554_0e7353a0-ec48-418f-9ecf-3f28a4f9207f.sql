-- Operations is derived from Owner: any role check for owner/admin is satisfied by operations.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (role = 'operations'::public.app_role
            AND _role IN ('owner'::public.app_role, 'admin'::public.app_role))
      )
  )
$function$;

-- Strict owner check that ignores the operations derivation (used by guards below).
CREATE OR REPLACE FUNCTION public.is_strict_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'owner'::public.app_role
  )
$function$;
REVOKE EXECUTE ON FUNCTION public.is_strict_owner(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_strict_owner(uuid) TO authenticated, service_role;

-- Hard limit 1: operations is never a super admin (no cross-tenant reach).
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role IN ('owner'::public.app_role, 'admin'::public.app_role)
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.organizations o ON o.id = p.org_id
      WHERE p.id = _user_id AND o.is_original_org
    )
$function$;

-- Hard limit 2: operations cannot create, change or remove an owner.
DROP POLICY IF EXISTS "Owners insert roles in their org" ON public.user_roles;
CREATE POLICY "Owners insert roles in their org" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role)
  AND user_in_my_org(user_id)
  AND (is_strict_owner(auth.uid()) OR role <> 'owner'::app_role)
);

DROP POLICY IF EXISTS "Owners update roles in their org" ON public.user_roles;
CREATE POLICY "Owners update roles in their org" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  AND user_in_my_org(user_id)
  AND (is_strict_owner(auth.uid()) OR (role <> 'owner'::app_role AND NOT is_strict_owner(user_id)))
)
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role)
  AND user_in_my_org(user_id)
  AND (is_strict_owner(auth.uid()) OR role <> 'owner'::app_role)
);

DROP POLICY IF EXISTS "Owners delete roles in their org" ON public.user_roles;
CREATE POLICY "Owners delete roles in their org" ON public.user_roles
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  AND user_in_my_org(user_id)
  AND (is_strict_owner(auth.uid()) OR (role <> 'owner'::app_role AND NOT is_strict_owner(user_id)))
);

-- Hard limit 3: operations cannot edit or delete an owner's profile record.
DROP POLICY IF EXISTS "Admins can update profiles in their org" ON public.profiles;
CREATE POLICY "Admins can update profiles in their org" ON public.profiles
FOR UPDATE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    is_admin_or_owner(auth.uid())
    AND org_id = current_user_org_id()
    AND (NOT is_operations(auth.uid()) OR NOT is_strict_owner(id) OR id = auth.uid())
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    is_admin_or_owner(auth.uid())
    AND org_id = current_user_org_id()
    AND (NOT is_operations(auth.uid()) OR NOT is_strict_owner(id) OR id = auth.uid())
  )
);
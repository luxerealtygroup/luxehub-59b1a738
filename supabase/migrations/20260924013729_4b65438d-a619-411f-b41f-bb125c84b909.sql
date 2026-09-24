CREATE OR REPLACE FUNCTION public.can_access_portal(_portal_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_accounts ca
    JOIN public.profiles p ON p.id = _user_id
    WHERE ca.id = _portal_id
      AND ca.org_id IS NOT NULL
      AND ca.org_id = p.org_id
      AND (
        ca.invited_by = _user_id
        OR ca.assigned_agent_id = _user_id
        OR public.is_admin_or_owner(_user_id)
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_access_portal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_portal(uuid, uuid) TO authenticated, service_role;
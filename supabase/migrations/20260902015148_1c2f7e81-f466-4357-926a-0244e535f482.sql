
CREATE OR REPLACE FUNCTION public.can_access_portal(_portal_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.client_accounts ca
    WHERE ca.id = _portal_id
      AND ca.org_id IS NOT NULL
      AND ca.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = _user_id)
      AND (
        public.is_admin_or_owner(_user_id)
        OR ca.invited_by = _user_id
      )
  );
$function$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_title TEXT;

CREATE OR REPLACE FUNCTION public.get_portal_participants(_portal_id uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, role_label text, is_client boolean, sort_order integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id UUID;
  v_creator_id UUID;
  v_client_user_id UUID;
  v_client_name TEXT;
  v_org_id UUID;
BEGIN
  IF NOT (public.can_access_portal(_portal_id, auth.uid()) OR public.owns_portal(_portal_id, auth.uid())) THEN
    RETURN;
  END IF;

  SELECT COALESCE(ca.assigned_agent_id, ca.invited_by), ca.invited_by, ca.user_id,
         COALESCE(ca.full_name, ca.email), ca.org_id
    INTO v_agent_id, v_creator_id, v_client_user_id, v_client_name, v_org_id
  FROM public.client_accounts ca
  WHERE ca.id = _portal_id;

  RETURN QUERY
  SELECT p.id,
         COALESCE(p.full_name, p.email, 'Team member'),
         p.avatar_url,
         COALESCE(
           p.display_title,
           CASE
             WHEN p.id = v_agent_id THEN 'Your Agent'
             WHEN public.has_role(p.id, 'operations') THEN 'Client Care'
             WHEN public.has_role(p.id, 'owner') THEN 'Broker of Record'
             ELSE 'Agent'
           END),
         FALSE,
         CASE WHEN p.id = v_agent_id THEN 0 WHEN public.has_role(p.id, 'operations') THEN 1 ELSE 2 END
  FROM public.profiles p
  WHERE p.org_id = v_org_id
    AND (
      p.id = v_agent_id
      OR p.id = v_creator_id
      OR public.has_role(p.id, 'operations')
      OR public.has_role(p.id, 'owner')
    );

  RETURN QUERY
  SELECT v_client_user_id, v_client_name, NULL::text, 'Client'::text, TRUE, 3;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_portal_participants(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_portal_participants(uuid) TO authenticated;
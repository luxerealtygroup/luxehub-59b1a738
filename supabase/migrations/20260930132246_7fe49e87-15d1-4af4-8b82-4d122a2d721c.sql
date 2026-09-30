CREATE OR REPLACE FUNCTION public.list_agent_options(_include_demo boolean DEFAULT false)
RETURNS TABLE(id uuid, full_name text, email text, member_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, COALESCE(p.email, u.email)::text, p.member_type
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE public.is_team_member(auth.uid())
    AND p.org_id = public.current_user_org_id()
    AND p.full_name IS NOT NULL
    AND public.is_team_member(p.id)
    AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until < now())
    AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
    AND (
      (p.member_type IN ('agent','operations') AND NOT p.is_demo_account)
      OR (_include_demo AND p.member_type = 'demo')
    )
  ORDER BY p.full_name;
$$;
REVOKE ALL ON FUNCTION public.list_agent_options(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_agent_options(boolean) TO authenticated;
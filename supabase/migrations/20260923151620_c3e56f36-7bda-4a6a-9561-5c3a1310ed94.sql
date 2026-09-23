REVOKE EXECUTE ON FUNCTION public.get_portal_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_portal_participants(uuid) TO authenticated, service_role;
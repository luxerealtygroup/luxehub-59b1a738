REVOKE EXECUTE ON FUNCTION public.can_use_script_boss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_script_boss(uuid) TO authenticated, service_role;
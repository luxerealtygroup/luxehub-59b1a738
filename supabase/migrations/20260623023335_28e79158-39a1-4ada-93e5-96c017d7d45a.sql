
-- Revoke from PUBLIC (which includes anon) for all security-definer helpers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_client(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_demo_account(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_cma_version(uuid) FROM PUBLIC;

-- Re-grant to authenticated (needed for RLS policy evaluation and rpc calls)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_demo_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cma_version(uuid) TO authenticated;

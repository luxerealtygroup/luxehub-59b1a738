REVOKE EXECUTE ON FUNCTION public.get_org_secret(uuid, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_instance_secret(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_secret(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_instance_secret(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_portal(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_portal_realtor(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.create_org_invite(text, app_role, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_org_invite(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.claim_org_invite(text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.set_org_id_from_context() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_portal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_realtor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_org_invite(text, app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_org_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_org_invite(text, text) TO authenticated;
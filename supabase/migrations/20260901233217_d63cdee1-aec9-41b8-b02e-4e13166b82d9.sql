REVOKE EXECUTE ON FUNCTION public.set_org_secret(uuid, text, text, uuid) FROM authenticated, anon, public;

CREATE OR REPLACE FUNCTION public.set_my_org_secret(_key text, _value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_org uuid;
BEGIN
  v_org := public.current_user_org_id();
  IF v_org IS NULL OR NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to manage integrations';
  END IF;
  PERFORM public.set_org_secret(v_org, _key, _value, auth.uid());
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.set_my_org_secret(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_org_secret(text, text) TO authenticated;
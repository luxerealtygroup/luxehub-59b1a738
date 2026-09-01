CREATE OR REPLACE FUNCTION public.org_has_integration(_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_integrations oi
    WHERE oi.org_id = public.current_user_org_id()
      AND oi.key = _key
  );
$$;

REVOKE ALL ON FUNCTION public.org_has_integration(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_has_integration(text) TO authenticated;
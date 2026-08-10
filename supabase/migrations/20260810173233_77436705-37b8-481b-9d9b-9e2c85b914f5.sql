CREATE OR REPLACE FUNCTION public.check_table_grants(_tables text[])
RETURNS TABLE(table_name text, table_exists boolean, rls_enabled boolean, can_select boolean, can_insert boolean, can_update boolean, can_delete boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t AS table_name,
         c.oid IS NOT NULL AS table_exists,
         COALESCE(c.relrowsecurity, false) AS rls_enabled,
         COALESCE(has_table_privilege('authenticated', c.oid, 'SELECT'), false),
         COALESCE(has_table_privilege('authenticated', c.oid, 'INSERT'), false),
         COALESCE(has_table_privilege('authenticated', c.oid, 'UPDATE'), false),
         COALESCE(has_table_privilege('authenticated', c.oid, 'DELETE'), false)
  FROM unnest(_tables) AS t
  LEFT JOIN pg_class c ON c.relname = t AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
$$;

REVOKE ALL ON FUNCTION public.check_table_grants(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_table_grants(text[]) TO service_role;
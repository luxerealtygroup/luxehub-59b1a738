CREATE OR REPLACE FUNCTION public.get_team_agents()
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, u.email::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.full_name IS NOT NULL
    AND public.is_team_member(p.id)
$$;

GRANT EXECUTE ON FUNCTION public.get_team_agents() TO authenticated;
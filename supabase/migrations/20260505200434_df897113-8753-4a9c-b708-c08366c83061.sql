
-- Helper: is the user a team member (any role)?
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- 1) PROFILES: restrict directory to team members
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
CREATE POLICY "Team members can view profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_team_member(auth.uid()) OR auth.uid() = id);

-- 2) CLIENT_ACCOUNTS: narrow cross-agent SELECT to owners only
DROP POLICY IF EXISTS "Agents can view client accounts" ON public.client_accounts;
CREATE POLICY "Agents view their own invited clients; owners view all"
ON public.client_accounts FOR SELECT
TO authenticated
USING (
  auth.uid() = invited_by
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

DROP POLICY IF EXISTS "Agents can insert client accounts" ON public.client_accounts;
CREATE POLICY "Agents insert clients they invite; owners insert any"
ON public.client_accounts FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = invited_by
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

-- 3) COMMISSIONS: narrow cross-agent SELECT to owners only
DROP POLICY IF EXISTS "Users can view commissions" ON public.commissions;
CREATE POLICY "Agents view own commissions; owners view all"
ON public.commissions FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

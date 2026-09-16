-- Operations must act, not just read. can_access_portal()/is_admin_or_owner() already include 'operations'.

-- 1. portal_photos: replace admin-only writes with portal-access writes
DROP POLICY IF EXISTS "portal_photos insert" ON public.portal_photos;
DROP POLICY IF EXISTS "portal_photos delete" ON public.portal_photos;

CREATE POLICY "portal_photos insert" ON public.portal_photos
FOR INSERT TO authenticated
WITH CHECK (can_access_portal(portal_id, auth.uid()) AND org_id = current_user_org_id());

CREATE POLICY "portal_photos update" ON public.portal_photos
FOR UPDATE TO authenticated
USING (can_access_portal(portal_id, auth.uid()) AND org_id = current_user_org_id())
WITH CHECK (can_access_portal(portal_id, auth.uid()) AND org_id = current_user_org_id());

CREATE POLICY "portal_photos delete" ON public.portal_photos
FOR DELETE TO authenticated
USING (can_access_portal(portal_id, auth.uid()) AND org_id = current_user_org_id());

-- 2. portal_documents: drop redundant admin-only duplicates, add missing agent update
DROP POLICY IF EXISTS "portal_documents insert" ON public.portal_documents;
DROP POLICY IF EXISTS "portal_documents delete" ON public.portal_documents;

DROP POLICY IF EXISTS "portal_documents agent update" ON public.portal_documents;
CREATE POLICY "portal_documents agent update" ON public.portal_documents
FOR UPDATE TO authenticated
USING (can_access_portal(portal_id, auth.uid()) AND org_id = current_user_org_id())
WITH CHECK (can_access_portal(portal_id, auth.uid()) AND org_id = current_user_org_id());

-- 3. Operations counts as a team member (profiles / launchpad visibility)
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner','admin','agent','planning_access','operations')
  )
$function$;

-- 4. Pipeline: admins/owners/operations can add & remove for any agent in their org
DROP POLICY IF EXISTS "Users can insert their own pipeline clients" ON public.pipeline_clients;
CREATE POLICY "Users and admins can insert pipeline clients" ON public.pipeline_clients
FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id OR is_admin_or_owner(auth.uid())) AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "Users can delete their own pipeline clients" ON public.pipeline_clients;
CREATE POLICY "Users and admins can delete pipeline clients" ON public.pipeline_clients
FOR DELETE TO authenticated
USING ((auth.uid() = user_id OR is_admin_or_owner(auth.uid())) AND org_id = current_user_org_id());

-- 5. Commissions: admin-level management for any agent in their org
DROP POLICY IF EXISTS "Users can insert their own commissions" ON public.commissions;
CREATE POLICY "Users and admins can insert commissions" ON public.commissions
FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id OR is_admin_or_owner(auth.uid())) AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "Users can update their own commissions" ON public.commissions;
CREATE POLICY "Users and admins can update commissions" ON public.commissions
FOR UPDATE TO authenticated
USING ((auth.uid() = user_id OR is_admin_or_owner(auth.uid())) AND org_id = current_user_org_id())
WITH CHECK ((auth.uid() = user_id OR is_admin_or_owner(auth.uid())) AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "Users can delete their own commissions" ON public.commissions;
CREATE POLICY "Users and admins can delete commissions" ON public.commissions
FOR DELETE TO authenticated
USING ((auth.uid() = user_id OR is_admin_or_owner(auth.uid())) AND org_id = current_user_org_id());
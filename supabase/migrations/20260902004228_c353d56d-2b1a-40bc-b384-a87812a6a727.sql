-- profiles: scope directory reads and admin writes to the caller's own org
DROP POLICY IF EXISTS "Team members can view profiles" ON public.profiles;
CREATE POLICY "Team members can view profiles in their org"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.is_super_admin(auth.uid())
  OR (public.is_team_member(auth.uid()) AND org_id = public.current_user_org_id())
);

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update profiles in their org"
ON public.profiles FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id())
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id())
);

-- historical backup of profiles: super-admins only
DROP POLICY IF EXISTS "Admins can view profiles backup" ON public.profiles_backup_pre_launchpad_20260811;
CREATE POLICY "Super admins can view profiles backup"
ON public.profiles_backup_pre_launchpad_20260811 FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

-- important_documents: org-scope admin writes
DROP POLICY IF EXISTS "Admins can insert important documents" ON public.important_documents;
CREATE POLICY "Admins can insert important documents in their org"
ON public.important_documents FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Admins can update important documents" ON public.important_documents;
CREATE POLICY "Admins can update important documents in their org"
ON public.important_documents FOR UPDATE TO authenticated
USING (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id())
WITH CHECK (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Admins can delete important documents" ON public.important_documents;
CREATE POLICY "Admins can delete important documents in their org"
ON public.important_documents FOR DELETE TO authenticated
USING (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

-- training_documents: org-scope writes
DROP POLICY IF EXISTS "All users can insert training documents" ON public.training_documents;
CREATE POLICY "Org members can insert training documents"
ON public.training_documents FOR INSERT TO authenticated
WITH CHECK (auth.uid() = uploaded_by AND org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Users can update their own training documents" ON public.training_documents;
CREATE POLICY "Org members can update training documents in their org"
ON public.training_documents FOR UPDATE TO authenticated
USING (org_id = public.current_user_org_id() AND (auth.uid() = uploaded_by OR public.is_admin_or_owner(auth.uid())))
WITH CHECK (org_id = public.current_user_org_id() AND (auth.uid() = uploaded_by OR public.is_admin_or_owner(auth.uid())));

DROP POLICY IF EXISTS "Admins can delete training documents" ON public.training_documents;
CREATE POLICY "Admins can delete training documents in their org"
ON public.training_documents FOR DELETE TO authenticated
USING (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());
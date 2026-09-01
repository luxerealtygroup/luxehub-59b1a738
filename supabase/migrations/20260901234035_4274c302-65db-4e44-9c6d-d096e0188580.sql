CREATE POLICY "Org admins manage their branding files"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'org-branding'
  AND (
    public.is_super_admin(auth.uid())
    OR ((storage.foldername(name))[1] = public.current_user_org_id()::text
        AND public.is_admin_or_owner(auth.uid()))
  )
)
WITH CHECK (
  bucket_id = 'org-branding'
  AND (
    public.is_super_admin(auth.uid())
    OR ((storage.foldername(name))[1] = public.current_user_org_id()::text
        AND public.is_admin_or_owner(auth.uid()))
  )
);
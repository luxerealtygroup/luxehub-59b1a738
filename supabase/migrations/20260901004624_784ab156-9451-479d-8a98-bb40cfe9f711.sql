CREATE POLICY "Anyone can upload an onboarding logo"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'onboarding-logos');

CREATE POLICY "Admins can read onboarding logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'onboarding-logos' AND public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can delete onboarding logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'onboarding-logos' AND public.is_admin_or_owner(auth.uid()));

drop policy if exists "Admins can read onboarding logos" on storage.objects;
drop policy if exists "Admins can delete onboarding logos" on storage.objects;

create policy "Super admins read onboarding logos"
on storage.objects for select to authenticated
using (bucket_id = 'onboarding-logos' and public.is_super_admin(auth.uid()));

create policy "Super admins delete onboarding logos"
on storage.objects for delete to authenticated
using (bucket_id = 'onboarding-logos' and public.is_super_admin(auth.uid()));

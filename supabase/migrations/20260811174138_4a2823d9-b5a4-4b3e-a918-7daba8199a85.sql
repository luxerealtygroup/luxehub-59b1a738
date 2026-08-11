CREATE TABLE public.profiles_backup_pre_launchpad_20260811 AS
SELECT * FROM public.profiles;

GRANT ALL ON public.profiles_backup_pre_launchpad_20260811 TO service_role;

ALTER TABLE public.profiles_backup_pre_launchpad_20260811 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view profiles backup"
  ON public.profiles_backup_pre_launchpad_20260811
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

GRANT SELECT ON public.profiles_backup_pre_launchpad_20260811 TO authenticated;
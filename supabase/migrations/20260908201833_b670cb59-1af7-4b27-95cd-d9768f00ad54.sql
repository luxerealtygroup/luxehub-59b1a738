CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.current_user_org_id(),
  key text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read settings"
ON public.app_settings FOR SELECT TO authenticated
USING (org_id = public.current_user_org_id());

CREATE POLICY "Admins can insert settings"
ON public.app_settings FOR INSERT TO authenticated
WITH CHECK (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update settings"
ON public.app_settings FOR UPDATE TO authenticated
USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()))
WITH CHECK (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.lead_attribution_cache (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_year int NOT NULL DEFAULT 2026,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_attribution_cache TO authenticated;
GRANT ALL ON public.lead_attribution_cache TO service_role;
ALTER TABLE public.lead_attribution_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins in the org read lead attribution" ON public.lead_attribution_cache
  FOR SELECT TO authenticated USING (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id());

CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'team' CHECK (tier IN ('free','pro','team')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  branding_logo_url TEXT,
  branding_primary_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Admins can update organizations"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can insert organizations"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Backfill Luxe Realty Group
INSERT INTO public.organizations (name, tier)
VALUES ('Luxe Realty Group', 'team');

-- Add org_id to profiles
ALTER TABLE public.profiles
  ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

UPDATE public.profiles
  SET org_id = (SELECT id FROM public.organizations WHERE name = 'Luxe Realty Group' LIMIT 1);

CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);

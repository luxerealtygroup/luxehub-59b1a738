-- Add pro_plus tier and store the "original" org flag for legacy-only features (Nominations, seeded resources).
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_tier_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_tier_check
  CHECK (tier IN ('free','pro','pro_plus','team'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_original_org boolean NOT NULL DEFAULT false;

-- Mark Luxe Realty Group as the original org (source of legacy seeded content).
UPDATE public.organizations
SET is_original_org = true
WHERE id = 'e4295d7b-c889-459f-81ef-4ee90bc939a7';
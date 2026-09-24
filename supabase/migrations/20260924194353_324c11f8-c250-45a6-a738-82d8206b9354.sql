ALTER TABLE public.planning_settings
  ADD COLUMN IF NOT EXISTS lease_full_unit_gci numeric NOT NULL DEFAULT 4000,
  ADD COLUMN IF NOT EXISTS lease_weight numeric NOT NULL DEFAULT 0.3333;
ALTER TABLE public.company_plans
  ADD COLUMN IF NOT EXISTS luxe_monthly_revenue numeric NOT NULL DEFAULT 13203,
  ADD COLUMN IF NOT EXISTS luxe_revenue_override numeric,
  ADD COLUMN IF NOT EXISTS gci_per_deal_override numeric;
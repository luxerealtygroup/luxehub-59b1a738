ALTER TABLE public.cma_reports
  ADD COLUMN IF NOT EXISTS feature_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS price_per_sqft_cross_check jsonb,
  ADD COLUMN IF NOT EXISTS valuation_scenarios jsonb;
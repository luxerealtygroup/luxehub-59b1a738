
ALTER TABLE public.cma_reports
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS improvements_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_executive_summary text,
  ADD COLUMN IF NOT EXISTS approved_price_narrative text,
  ADD COLUMN IF NOT EXISTS approved_strategy text,
  ADD COLUMN IF NOT EXISTS approved_market_conditions text,
  ADD COLUMN IF NOT EXISTS approved_talking_points text,
  ADD COLUMN IF NOT EXISTS approved_risk_flags text,
  ADD COLUMN IF NOT EXISTS approved_objections text;

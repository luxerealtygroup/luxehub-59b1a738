
-- Add lifecycle tracking fields to cma_reports
ALTER TABLE public.cma_reports
  ADD COLUMN listing_status text NOT NULL DEFAULT 'CMA Created',
  ADD COLUMN listing_signed_at timestamptz DEFAULT NULL,
  ADD COLUMN listing_active_at timestamptz DEFAULT NULL,
  ADD COLUMN listing_sold_at timestamptz DEFAULT NULL,
  ADD COLUMN final_list_price numeric DEFAULT NULL,
  ADD COLUMN final_sold_price numeric DEFAULT NULL,
  ADD COLUMN equity_recalc_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_equity_update timestamptz DEFAULT NULL,
  ADD COLUMN lifecycle_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN fub_automation_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN prev_median_sale_price numeric DEFAULT NULL,
  ADD COLUMN prev_avg_days_on_market numeric DEFAULT NULL,
  ADD COLUMN market_shift_detected boolean NOT NULL DEFAULT false;

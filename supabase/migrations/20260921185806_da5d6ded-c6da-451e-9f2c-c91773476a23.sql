ALTER TABLE public.cma_reports
  ADD COLUMN IF NOT EXISTS comp_price_anomaly_confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS comp_price_anomaly_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS comp_price_anomaly_note text;
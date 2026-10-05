ALTER TABLE public.open_houses
  ADD COLUMN IF NOT EXISTS listing_report_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS listing_report_sent_to text,
  ADD COLUMN IF NOT EXISTS listing_report_sent_by uuid;
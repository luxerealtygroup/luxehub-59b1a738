ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS fub_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS fub_sync_error text;
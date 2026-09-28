ALTER TABLE public.weekly_411
  ADD COLUMN IF NOT EXISTS fub_conversations integer,
  ADD COLUMN IF NOT EXISTS fub_pipeline_adds integer,
  ADD COLUMN IF NOT EXISTS fub_agreements integer,
  ADD COLUMN IF NOT EXISTS fub_pending integer,
  ADD COLUMN IF NOT EXISTS fub_closed integer,
  ADD COLUMN IF NOT EXISTS fub_closed_units numeric,
  ADD COLUMN IF NOT EXISTS fub_gci numeric,
  ADD COLUMN IF NOT EXISTS fub_speed_to_lead_minutes integer,
  ADD COLUMN IF NOT EXISTS fub_emails_sent integer;
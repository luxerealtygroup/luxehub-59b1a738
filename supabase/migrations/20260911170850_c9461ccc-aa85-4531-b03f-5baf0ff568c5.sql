ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS fub_stage text,
  ADD COLUMN IF NOT EXISTS fub_stage_result text;
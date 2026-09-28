ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS fub_agent_tag text,
  ADD COLUMN IF NOT EXISTS fub_agent_tag_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS fub_agent_tag_result text;
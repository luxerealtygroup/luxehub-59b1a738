ALTER TABLE public.deal_metadata
  ADD COLUMN IF NOT EXISTS producing_agent_2_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS producing_split_percent integer NOT NULL DEFAULT 100;

ALTER TABLE public.deal_metadata
  DROP CONSTRAINT IF EXISTS deal_metadata_split_valid;

ALTER TABLE public.deal_metadata
  ADD CONSTRAINT deal_metadata_split_valid CHECK (
    producing_split_percent BETWEEN 0 AND 100
    AND (producing_agent_2_id IS NOT NULL OR producing_split_percent = 100)
    AND (producing_agent_2_id IS NULL OR producing_agent_2_id <> producing_agent_id)
  );

ALTER TABLE public.weekly_411
  ADD COLUMN IF NOT EXISTS contacts_goal integer DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS member_type text NOT NULL DEFAULT 'agent';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_member_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_member_type_check
  CHECK (member_type IN ('agent','operations','client','demo','system'));

ALTER TABLE public.deal_metadata
  ADD COLUMN IF NOT EXISTS producing_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_note text;

ALTER TABLE public.deal_metadata ALTER COLUMN deal_category DROP NOT NULL;
ALTER TABLE public.deal_metadata ALTER COLUMN deal_category DROP DEFAULT;

CREATE INDEX IF NOT EXISTS deal_metadata_producing_agent_idx
  ON public.deal_metadata (producing_agent_id);
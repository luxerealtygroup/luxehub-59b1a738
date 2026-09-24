ALTER TABLE public.deal_metadata
  ADD COLUMN IF NOT EXISTS personal_transaction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS double_end boolean NOT NULL DEFAULT false;
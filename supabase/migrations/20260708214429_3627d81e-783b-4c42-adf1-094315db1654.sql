ALTER TABLE public.client_transactions
  ADD COLUMN IF NOT EXISTS fub_deal_id bigint;

ALTER TABLE public.portal_timeline_notes
  ADD COLUMN IF NOT EXISTS transaction_id uuid
    REFERENCES public.client_transactions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS portal_timeline_notes_transaction_idx
  ON public.portal_timeline_notes(transaction_id, created_at DESC);
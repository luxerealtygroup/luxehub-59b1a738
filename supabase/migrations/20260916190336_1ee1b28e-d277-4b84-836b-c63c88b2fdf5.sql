ALTER TABLE public.open_houses
  ADD COLUMN IF NOT EXISTS portal_account_id uuid REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_document_id uuid REFERENCES public.portal_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_sent_at timestamptz;

ALTER TABLE public.cma_reports
  ADD COLUMN IF NOT EXISTS portal_account_id uuid REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_document_id uuid REFERENCES public.portal_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_sent_at timestamptz;
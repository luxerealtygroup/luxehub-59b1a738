ALTER TABLE public.pipeline_clients
  ADD COLUMN IF NOT EXISTS portal_id uuid REFERENCES public.client_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_clients_portal_id ON public.pipeline_clients(portal_id);
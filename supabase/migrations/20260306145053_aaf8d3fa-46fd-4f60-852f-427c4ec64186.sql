ALTER TABLE public.cma_reports ADD COLUMN IF NOT EXISTS cma_source_url text DEFAULT NULL;
ALTER TABLE public.cma_import_logs ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'pdf';
ALTER TABLE public.cma_import_logs ADD COLUMN IF NOT EXISTS cma_source_url text DEFAULT NULL;

CREATE TABLE public.cma_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cma_report_id uuid REFERENCES public.cma_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_name text,
  file_size_bytes integer,
  estimated_page_count integer,
  total_blocks_detected integer NOT NULL DEFAULT 0,
  comps_imported integer NOT NULL DEFAULT 0,
  comps_partial integer NOT NULL DEFAULT 0,
  comps_skipped integer NOT NULL DEFAULT 0,
  skip_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  extraction_passes integer NOT NULL DEFAULT 1,
  extraction_duration_ms integer,
  raw_text_length integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cma_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own import logs"
ON public.cma_import_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own import logs"
ON public.cma_import_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

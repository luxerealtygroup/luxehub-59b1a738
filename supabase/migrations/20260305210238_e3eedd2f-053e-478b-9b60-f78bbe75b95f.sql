
CREATE OR REPLACE FUNCTION public.increment_cma_version(report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.cma_reports
  SET version_number = version_number + 1
  WHERE id = report_id;
END;
$$;

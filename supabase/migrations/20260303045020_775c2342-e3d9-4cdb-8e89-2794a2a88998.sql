
-- Add FUB contact columns to cma_reports
ALTER TABLE public.cma_reports
  ADD COLUMN fub_person_id integer DEFAULT NULL,
  ADD COLUMN fub_person_name text DEFAULT NULL;

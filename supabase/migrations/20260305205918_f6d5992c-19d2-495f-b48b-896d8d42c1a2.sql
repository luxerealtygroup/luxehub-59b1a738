
ALTER TABLE public.cma_reports
ADD COLUMN version_number integer NOT NULL DEFAULT 1,
ADD COLUMN last_edited_by uuid DEFAULT NULL;

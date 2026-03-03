ALTER TABLE public.cma_reports 
  ADD COLUMN IF NOT EXISTS subject_photos jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_photo_index integer DEFAULT 0;
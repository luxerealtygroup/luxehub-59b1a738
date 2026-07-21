ALTER TABLE public.cma_reports
  ALTER COLUMN bedrooms TYPE TEXT USING bedrooms::text,
  ALTER COLUMN bathrooms TYPE TEXT USING bathrooms::text,
  ADD COLUMN IF NOT EXISTS above_grade_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS finished_basement_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS garage TEXT,
  ADD COLUMN IF NOT EXISTS build_year INTEGER,
  ADD COLUMN IF NOT EXISTS condition TEXT,
  ADD COLUMN IF NOT EXISTS key_features JSONB NOT NULL DEFAULT '[]'::jsonb;
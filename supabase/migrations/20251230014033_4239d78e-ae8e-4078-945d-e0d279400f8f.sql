-- Add missing columns for Open House form
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS door_knockers_needed TEXT,
ADD COLUMN IF NOT EXISTS door_knockers_quantity TEXT,
ADD COLUMN IF NOT EXISTS feature_sheets_needed TEXT,
ADD COLUMN IF NOT EXISTS second_date DATE,
ADD COLUMN IF NOT EXISTS second_time TEXT;
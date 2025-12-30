-- Add attachments column to store multiple file paths as JSON array
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
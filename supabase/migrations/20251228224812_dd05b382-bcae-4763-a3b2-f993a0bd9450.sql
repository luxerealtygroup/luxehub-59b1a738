-- Add source column to deals table for tracking lead source
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;
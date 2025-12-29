-- Add condition deadline to commissions table for tracking conditional deals
ALTER TABLE public.commissions 
ADD COLUMN IF NOT EXISTS condition_deadline date,
ADD COLUMN IF NOT EXISTS condition_notes text;
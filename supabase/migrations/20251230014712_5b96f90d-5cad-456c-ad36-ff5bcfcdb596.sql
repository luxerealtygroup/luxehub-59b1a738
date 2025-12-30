-- Add missing Buyer form fields for condition dates and pricing
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS condition_due_sbp DATE,
ADD COLUMN IF NOT EXISTS condition_due_financing DATE,
ADD COLUMN IF NOT EXISTS condition_due_status DATE,
ADD COLUMN IF NOT EXISTS condition_due_home_inspection DATE,
ADD COLUMN IF NOT EXISTS condition_due_other DATE,
ADD COLUMN IF NOT EXISTS condition_other_description TEXT,
ADD COLUMN IF NOT EXISTS firm_price NUMERIC,
ADD COLUMN IF NOT EXISTS conditional_price NUMERIC,
ADD COLUMN IF NOT EXISTS cooperating_commission TEXT,
ADD COLUMN IF NOT EXISTS bra_reco_files JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ids_files JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS fintracker_files JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS other_docs_files JSONB DEFAULT '[]'::jsonb;
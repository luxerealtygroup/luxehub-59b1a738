-- Add expected_pending_date column to pipeline_clients for auto-staging based on when deal goes pending
ALTER TABLE public.pipeline_clients
ADD COLUMN expected_pending_date date;
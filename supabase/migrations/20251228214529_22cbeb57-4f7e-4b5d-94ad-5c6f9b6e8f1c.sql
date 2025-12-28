-- Add status column to pipeline_clients table
ALTER TABLE public.pipeline_clients 
ADD COLUMN status text DEFAULT NULL;

-- Add a comment to describe valid values
COMMENT ON COLUMN public.pipeline_clients.status IS 'Status tags: Buyers (under_contract, appointment_held, appointment_set), Sellers (active_listing, appointment_held, appointment_set)';
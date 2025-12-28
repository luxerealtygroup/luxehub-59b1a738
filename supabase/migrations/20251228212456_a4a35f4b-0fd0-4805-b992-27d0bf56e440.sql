-- Add buyer/seller type and projected financials to pipeline_clients
ALTER TABLE public.pipeline_clients
ADD COLUMN client_type text NOT NULL DEFAULT 'buyer',
ADD COLUMN projected_sale_amount numeric DEFAULT 0,
ADD COLUMN projected_gci numeric DEFAULT 0;

-- Add check constraint for client_type
ALTER TABLE public.pipeline_clients
ADD CONSTRAINT pipeline_clients_client_type_check CHECK (client_type IN ('buyer', 'seller'));
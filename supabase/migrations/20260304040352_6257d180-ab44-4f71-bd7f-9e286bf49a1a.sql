ALTER TABLE public.pipeline_clients 
ADD COLUMN deal_category text NOT NULL DEFAULT 'sale' 
CONSTRAINT pipeline_clients_deal_category_check CHECK (deal_category IN ('sale', 'lease'));
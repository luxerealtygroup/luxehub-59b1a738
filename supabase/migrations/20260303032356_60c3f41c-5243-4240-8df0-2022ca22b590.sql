
-- Create manual_production table for non-FUB agents
CREATE TABLE public.manual_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  month integer NOT NULL DEFAULT EXTRACT(MONTH FROM now()),
  closed_deals integer NOT NULL DEFAULT 0,
  pending_deals integer NOT NULL DEFAULT 0,
  gci_closed numeric NOT NULL DEFAULT 0,
  gci_pending numeric NOT NULL DEFAULT 0,
  total_volume numeric NOT NULL DEFAULT 0,
  database_size integer NOT NULL DEFAULT 0,
  pipeline_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, month)
);

-- Enable RLS
ALTER TABLE public.manual_production ENABLE ROW LEVEL SECURITY;

-- Users can view their own data
CREATE POLICY "Users can view their own manual production"
ON public.manual_production FOR SELECT
USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

-- Users can insert their own data
CREATE POLICY "Users can insert their own manual production"
ON public.manual_production FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own data
CREATE POLICY "Users can update their own manual production"
ON public.manual_production FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own data
CREATE POLICY "Users can delete their own manual production"
ON public.manual_production FOR DELETE
USING (auth.uid() = user_id);

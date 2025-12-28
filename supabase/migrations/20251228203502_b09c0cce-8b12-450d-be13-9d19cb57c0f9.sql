-- Create pipeline_clients table for categorizing clients by buying timeline
CREATE TABLE public.pipeline_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  stage INTEGER NOT NULL DEFAULT 5 CHECK (stage >= 1 AND stage <= 10),
  notes TEXT,
  property_interest TEXT,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipeline_clients ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own pipeline clients"
ON public.pipeline_clients FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pipeline clients"
ON public.pipeline_clients FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pipeline clients"
ON public.pipeline_clients FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pipeline clients"
ON public.pipeline_clients FOR DELETE
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_pipeline_clients_updated_at
BEFORE UPDATE ON public.pipeline_clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
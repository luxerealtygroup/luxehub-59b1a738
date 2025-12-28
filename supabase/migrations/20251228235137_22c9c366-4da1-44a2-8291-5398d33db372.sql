-- Create company_goals table for team-wide goal tracking
CREATE TABLE public.company_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  annual_deals_goal INTEGER DEFAULT 0,
  annual_gci_goal NUMERIC DEFAULT 0,
  annual_volume_goal NUMERIC DEFAULT 0,
  annual_revenue_goal NUMERIC DEFAULT 0,
  monthly_goals JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(year)
);

-- Enable RLS
ALTER TABLE public.company_goals ENABLE ROW LEVEL SECURITY;

-- Only admins/owners can view company goals
CREATE POLICY "Admins can view company goals" 
ON public.company_goals 
FOR SELECT 
USING (is_admin_or_owner(auth.uid()));

-- Only admins/owners can insert company goals
CREATE POLICY "Admins can insert company goals" 
ON public.company_goals 
FOR INSERT 
WITH CHECK (is_admin_or_owner(auth.uid()));

-- Only admins/owners can update company goals
CREATE POLICY "Admins can update company goals" 
ON public.company_goals 
FOR UPDATE 
USING (is_admin_or_owner(auth.uid()));

-- Only admins/owners can delete company goals
CREATE POLICY "Admins can delete company goals" 
ON public.company_goals 
FOR DELETE 
USING (is_admin_or_owner(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_company_goals_updated_at
BEFORE UPDATE ON public.company_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
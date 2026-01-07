-- Create a table for monthly budget expenses (categorized)
CREATE TABLE public.company_budget_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(year, month, category)
);

-- Enable RLS
ALTER TABLE public.company_budget_expenses ENABLE ROW LEVEL SECURITY;

-- Only admins/owners can view budget
CREATE POLICY "Admins can view budget expenses"
ON public.company_budget_expenses
FOR SELECT
USING (public.is_admin_or_owner(auth.uid()));

-- Only admins/owners can insert budget
CREATE POLICY "Admins can create budget expenses"
ON public.company_budget_expenses
FOR INSERT
WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Only admins/owners can update budget
CREATE POLICY "Admins can update budget expenses"
ON public.company_budget_expenses
FOR UPDATE
USING (public.is_admin_or_owner(auth.uid()));

-- Only admins/owners can delete budget
CREATE POLICY "Admins can delete budget expenses"
ON public.company_budget_expenses
FOR DELETE
USING (public.is_admin_or_owner(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_company_budget_expenses_updated_at
BEFORE UPDATE ON public.company_budget_expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
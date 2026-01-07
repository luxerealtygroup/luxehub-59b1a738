-- Add is_recurring column to company_budget_expenses
ALTER TABLE public.company_budget_expenses 
ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;
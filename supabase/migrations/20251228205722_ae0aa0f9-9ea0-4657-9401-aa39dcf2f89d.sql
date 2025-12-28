-- Add commission split columns to commissions table
ALTER TABLE public.commissions
ADD COLUMN gross_commission numeric,
ADD COLUMN agent_split_percent numeric DEFAULT 100,
ADD COLUMN team_split_percent numeric DEFAULT 0,
ADD COLUMN brokerage_split_percent numeric DEFAULT 0,
ADD COLUMN referral_amount numeric DEFAULT 0,
ADD COLUMN other_deductions numeric DEFAULT 0,
ADD COLUMN transaction_side text DEFAULT 'buyer';

-- Add comment for clarity
COMMENT ON COLUMN public.commissions.gross_commission IS 'Total commission before any splits';
COMMENT ON COLUMN public.commissions.agent_split_percent IS 'Agent percentage of commission after brokerage';
COMMENT ON COLUMN public.commissions.team_split_percent IS 'Team split percentage';
COMMENT ON COLUMN public.commissions.brokerage_split_percent IS 'Brokerage percentage';
COMMENT ON COLUMN public.commissions.referral_amount IS 'Referral fee amount in dollars';
COMMENT ON COLUMN public.commissions.other_deductions IS 'Other deductions like TC fees';
COMMENT ON COLUMN public.commissions.transaction_side IS 'buyer or seller side';
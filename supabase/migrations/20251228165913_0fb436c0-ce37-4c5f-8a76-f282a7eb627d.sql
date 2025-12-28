-- Add company split percentage to deals
ALTER TABLE public.deals ADD COLUMN company_split_percentage numeric DEFAULT 30;

-- Create table for co-listing agents (agents who split commission on a deal)
CREATE TABLE public.deal_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'co_agent', -- 'co_agent' or 'referral'
  split_percentage numeric DEFAULT 0, -- for co-agents, what % of agent's portion they get
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(deal_id, user_id)
);

-- Enable RLS on deal_participants
ALTER TABLE public.deal_participants ENABLE ROW LEVEL SECURITY;

-- Policies for deal_participants - participants can see deals they're on
CREATE POLICY "Users can view deals they participate in"
ON public.deal_participants
FOR SELECT
USING (
  auth.uid() = user_id OR 
  deal_id IN (SELECT id FROM public.deals WHERE user_id = auth.uid())
);

CREATE POLICY "Deal owners can add participants"
ON public.deal_participants
FOR INSERT
WITH CHECK (
  deal_id IN (SELECT id FROM public.deals WHERE user_id = auth.uid())
);

CREATE POLICY "Deal owners can update participants"
ON public.deal_participants
FOR UPDATE
USING (
  deal_id IN (SELECT id FROM public.deals WHERE user_id = auth.uid())
);

CREATE POLICY "Deal owners can delete participants"
ON public.deal_participants
FOR DELETE
USING (
  deal_id IN (SELECT id FROM public.deals WHERE user_id = auth.uid())
);

-- Update profiles policy to allow authenticated users to see team members
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Add trigger for updated_at on deal_participants
CREATE TRIGGER update_deal_participants_updated_at
BEFORE UPDATE ON public.deal_participants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Link clients to their transactions/deals
CREATE TABLE public.client_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid REFERENCES public.client_accounts(id) ON DELETE CASCADE NOT NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  property_address text NOT NULL,
  transaction_type text NOT NULL DEFAULT 'buyer', -- 'buyer' or 'seller'
  status text NOT NULL DEFAULT 'active', -- 'active', 'pending', 'closed', 'cancelled'
  list_price numeric,
  sale_price numeric,
  offer_date date,
  acceptance_date date,
  inspection_date date,
  appraisal_date date,
  financing_deadline date,
  closing_date date,
  property_photos jsonb DEFAULT '[]'::jsonb,
  property_description text,
  agent_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_transactions ENABLE ROW LEVEL SECURITY;

-- Clients can view their own transactions
CREATE POLICY "Clients can view their own transactions"
ON public.client_transactions
FOR SELECT
USING (
  client_account_id IN (
    SELECT id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

-- Agents can manage transactions they own
CREATE POLICY "Agents can view their transactions"
ON public.client_transactions
FOR SELECT
USING (agent_id = auth.uid() OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Agents can insert transactions"
ON public.client_transactions
FOR INSERT
WITH CHECK (agent_id = auth.uid() OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Agents can update their transactions"
ON public.client_transactions
FOR UPDATE
USING (agent_id = auth.uid() OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Agents can delete their transactions"
ON public.client_transactions
FOR DELETE
USING (agent_id = auth.uid() OR is_admin_or_owner(auth.uid()));

-- Transaction milestones
CREATE TABLE public.transaction_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.client_transactions(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  due_date date,
  completed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_milestones ENABLE ROW LEVEL SECURITY;

-- Clients can view milestones for their transactions
CREATE POLICY "Clients can view their milestones"
ON public.transaction_milestones
FOR SELECT
USING (
  transaction_id IN (
    SELECT ct.id FROM public.client_transactions ct
    JOIN public.client_accounts ca ON ct.client_account_id = ca.id
    WHERE ca.user_id = auth.uid()
  )
);

-- Agents can manage milestones
CREATE POLICY "Agents can manage milestones"
ON public.transaction_milestones
FOR ALL
USING (
  transaction_id IN (
    SELECT id FROM public.client_transactions WHERE agent_id = auth.uid()
  ) OR is_admin_or_owner(auth.uid())
);

-- Client tasks
CREATE TABLE public.client_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid REFERENCES public.client_accounts(id) ON DELETE CASCADE NOT NULL,
  transaction_id uuid REFERENCES public.client_transactions(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  completed_at timestamp with time zone,
  assigned_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

-- Clients can view and update their own tasks
CREATE POLICY "Clients can view their tasks"
ON public.client_tasks
FOR SELECT
USING (
  client_account_id IN (
    SELECT id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clients can update their tasks"
ON public.client_tasks
FOR UPDATE
USING (
  client_account_id IN (
    SELECT id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

-- Agents can manage tasks they assigned
CREATE POLICY "Agents can manage tasks"
ON public.client_tasks
FOR ALL
USING (assigned_by = auth.uid() OR is_admin_or_owner(auth.uid()));

-- Client messages
CREATE TABLE public.client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid REFERENCES public.client_accounts(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid NOT NULL,
  sender_type text NOT NULL, -- 'client' or 'agent'
  message text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

-- Clients can view and send messages
CREATE POLICY "Clients can view their messages"
ON public.client_messages
FOR SELECT
USING (
  client_account_id IN (
    SELECT id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clients can send messages"
ON public.client_messages
FOR INSERT
WITH CHECK (
  client_account_id IN (
    SELECT id FROM public.client_accounts WHERE user_id = auth.uid()
  ) AND sender_type = 'client'
);

CREATE POLICY "Clients can update read status"
ON public.client_messages
FOR UPDATE
USING (
  client_account_id IN (
    SELECT id FROM public.client_accounts WHERE user_id = auth.uid()
  )
);

-- Agents can view and send messages to their clients
CREATE POLICY "Agents can view client messages"
ON public.client_messages
FOR SELECT
USING (
  client_account_id IN (
    SELECT ca.id FROM public.client_accounts ca WHERE ca.invited_by = auth.uid()
  ) OR is_admin_or_owner(auth.uid())
);

CREATE POLICY "Agents can send messages"
ON public.client_messages
FOR INSERT
WITH CHECK (
  (client_account_id IN (
    SELECT ca.id FROM public.client_accounts ca WHERE ca.invited_by = auth.uid()
  ) AND sender_type = 'agent') OR is_admin_or_owner(auth.uid())
);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_messages;

-- Add triggers for updated_at
CREATE TRIGGER update_client_transactions_updated_at
BEFORE UPDATE ON public.client_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transaction_milestones_updated_at
BEFORE UPDATE ON public.transaction_milestones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_tasks_updated_at
BEFORE UPDATE ON public.client_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
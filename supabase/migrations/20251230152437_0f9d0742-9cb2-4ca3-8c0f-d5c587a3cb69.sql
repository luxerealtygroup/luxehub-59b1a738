-- Create client_accounts table to store client portal access
CREATE TABLE public.client_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  full_name text,
  phone text,
  fub_person_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  invited_by uuid,
  UNIQUE(user_id),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

-- Clients can view their own account
CREATE POLICY "Clients can view their own account"
ON public.client_accounts
FOR SELECT
USING (auth.uid() = user_id);

-- Clients can update their own account
CREATE POLICY "Clients can update their own account"
ON public.client_accounts
FOR UPDATE
USING (auth.uid() = user_id);

-- Agents/admins can view and manage client accounts
CREATE POLICY "Agents can view client accounts"
ON public.client_accounts
FOR SELECT
USING (is_admin_or_owner(auth.uid()) OR auth.uid() = invited_by);

CREATE POLICY "Agents can insert client accounts"
ON public.client_accounts
FOR INSERT
WITH CHECK (is_admin_or_owner(auth.uid()) OR auth.uid() = invited_by);

-- Create function to check if user is a client
CREATE OR REPLACE FUNCTION public.is_client(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_accounts
    WHERE user_id = _user_id
  )
$$;

-- Update client_documents RLS to allow clients to view their own documents
CREATE POLICY "Clients can view their own documents"
ON public.client_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.client_accounts ca
    WHERE ca.user_id = auth.uid()
    AND (
      ca.fub_person_id = client_documents.fub_person_id
      OR LOWER(ca.email) = LOWER(client_documents.client_name)
    )
  )
);

-- Trigger to update updated_at
CREATE TRIGGER update_client_accounts_updated_at
BEFORE UPDATE ON public.client_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
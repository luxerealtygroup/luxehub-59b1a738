-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'agent');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'agent',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user is admin or owner
CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'admin')
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Only owners can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Only owners can update roles"
ON public.user_roles FOR UPDATE
USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Only owners can delete roles"
ON public.user_roles FOR DELETE
USING (public.has_role(auth.uid(), 'owner'));

-- Update RLS policies on deals table to allow admins/owners to see all
DROP POLICY IF EXISTS "Users can view their own deals" ON public.deals;
CREATE POLICY "Users can view deals"
ON public.deals FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

-- Update RLS policies on commissions table
DROP POLICY IF EXISTS "Users can view their own commissions" ON public.commissions;
CREATE POLICY "Users can view commissions"
ON public.commissions FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

-- Update RLS policies on pipeline_clients table
DROP POLICY IF EXISTS "Users can view their own pipeline clients" ON public.pipeline_clients;
CREATE POLICY "Users can view pipeline clients"
ON public.pipeline_clients FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

-- Update RLS policies on agent_activities table
DROP POLICY IF EXISTS "Users can view their own activities" ON public.agent_activities;
CREATE POLICY "Users can view activities"
ON public.agent_activities FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

-- Update RLS policies on agent_goals table
DROP POLICY IF EXISTS "Users can view their own goals" ON public.agent_goals;
CREATE POLICY "Users can view goals"
ON public.agent_goals FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

-- Update RLS policies on production_goals table
DROP POLICY IF EXISTS "Users can view their own production goals" ON public.production_goals;
CREATE POLICY "Users can view production goals"
ON public.production_goals FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

-- Update RLS policies on weekly_411 table
DROP POLICY IF EXISTS "Users can view their own 411" ON public.weekly_411;
CREATE POLICY "Users can view 411"
ON public.weekly_411 FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

-- Create trigger for updated_at on user_roles
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
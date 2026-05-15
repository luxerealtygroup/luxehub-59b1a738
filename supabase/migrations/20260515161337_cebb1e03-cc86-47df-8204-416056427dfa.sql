-- Add demo flag to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_demo_account boolean NOT NULL DEFAULT false;

-- Helper: detect demo accounts
CREATE OR REPLACE FUNCTION public.is_demo_account(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_demo_account FROM public.profiles WHERE id = _user_id), false)
$$;

-- Make is_admin_or_owner return false for demo accounts so RLS falls back to per-user scoping
CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'admin')
  )
  AND NOT public.is_demo_account(_user_id)
$$;
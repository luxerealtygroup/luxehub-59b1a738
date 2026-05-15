CREATE TABLE public.agent_claude_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL UNIQUE,
  bio TEXT,
  goals JSONB DEFAULT '[]'::jsonb,
  tasks JSONB DEFAULT '[]'::jsonb,
  assistant_intro TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_claude_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view claude profiles"
ON public.agent_claude_profiles FOR SELECT
TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can insert claude profiles"
ON public.agent_claude_profiles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update claude profiles"
ON public.agent_claude_profiles FOR UPDATE
TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can delete claude profiles"
ON public.agent_claude_profiles FOR DELETE
TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_agent_claude_profiles_updated_at
BEFORE UPDATE ON public.agent_claude_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
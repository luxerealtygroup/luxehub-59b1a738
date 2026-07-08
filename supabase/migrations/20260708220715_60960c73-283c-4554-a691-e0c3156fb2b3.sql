CREATE TABLE IF NOT EXISTS public.agent_google_drive_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_google_drive_tokens TO authenticated;
GRANT ALL ON public.agent_google_drive_tokens TO service_role;

ALTER TABLE public.agent_google_drive_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view their own drive tokens"
  ON public.agent_google_drive_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Agents can insert their own drive tokens"
  ON public.agent_google_drive_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Agents can update their own drive tokens"
  ON public.agent_google_drive_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Agents can delete their own drive tokens"
  ON public.agent_google_drive_tokens FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_agent_google_drive_tokens_updated_at
  BEFORE UPDATE ON public.agent_google_drive_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
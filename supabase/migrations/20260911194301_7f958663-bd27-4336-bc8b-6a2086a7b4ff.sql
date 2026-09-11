ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS fub_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fub_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS fub_note_due_at timestamptz;

CREATE INDEX IF NOT EXISTS open_house_visitors_fub_pending_idx
  ON public.open_house_visitors (fub_next_attempt_at)
  WHERE fub_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS open_house_visitors_fub_note_due_idx
  ON public.open_house_visitors (fub_note_due_at)
  WHERE fub_note_due_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.openhouse_mark_fub_note_due()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.fub_contact_id IS NOT NULL AND (
       NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.price_feedback IS DISTINCT FROM OLD.price_feedback
    OR NEW.condition_feedback IS DISTINCT FROM OLD.condition_feedback
    OR NEW.temperature IS DISTINCT FROM OLD.temperature
    OR NEW.interest_level IS DISTINCT FROM OLD.interest_level
    OR NEW.timeline IS DISTINCT FROM OLD.timeline
    OR NEW.lender_status IS DISTINCT FROM OLD.lender_status
    OR NEW.intent IS DISTINCT FROM OLD.intent
    OR NEW.has_home_to_sell IS DISTINCT FROM OLD.has_home_to_sell
    OR NEW.working_with_agent IS DISTINCT FROM OLD.working_with_agent
    OR NEW.agent_name IS DISTINCT FROM OLD.agent_name
    OR NEW.custom_answers IS DISTINCT FROM OLD.custom_answers
  ) THEN
    NEW.fub_note_due_at := now() + interval '5 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS openhouse_visitor_note_due ON public.open_house_visitors;
CREATE TRIGGER openhouse_visitor_note_due
BEFORE UPDATE ON public.open_house_visitors
FOR EACH ROW EXECUTE FUNCTION public.openhouse_mark_fub_note_due();

CREATE TABLE IF NOT EXISTS public.fub_sweep_lease (
  id text PRIMARY KEY,
  locked_until timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fub_sweep_lease TO service_role;
ALTER TABLE public.fub_sweep_lease ENABLE ROW LEVEL SECURITY;
INSERT INTO public.fub_sweep_lease (id, locked_until)
VALUES ('openhouse-fub', now())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agent_fub_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL DEFAULT current_user_org_id(),
  default_stage text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_fub_prefs TO authenticated;
GRANT ALL ON public.agent_fub_prefs TO service_role;
ALTER TABLE public.agent_fub_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage their own Follow Up Boss preference"
ON public.agent_fub_prefs FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND org_id = current_user_org_id());

CREATE POLICY "Admins read team Follow Up Boss preferences"
ON public.agent_fub_prefs FOR SELECT TO authenticated
USING (org_id = current_user_org_id() AND is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_agent_fub_prefs_updated_at
BEFORE UPDATE ON public.agent_fub_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
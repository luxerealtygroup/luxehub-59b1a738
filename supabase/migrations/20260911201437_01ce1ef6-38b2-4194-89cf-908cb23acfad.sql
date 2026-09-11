ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS fub_stage_due_at timestamptz;

CREATE INDEX IF NOT EXISTS open_house_visitors_fub_stage_due_idx
  ON public.open_house_visitors (fub_stage_due_at)
  WHERE fub_stage_due_at IS NOT NULL;

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

  IF NEW.fub_contact_id IS NOT NULL
     AND NEW.fub_stage IS NOT NULL
     AND NEW.fub_stage IS DISTINCT FROM OLD.fub_stage THEN
    NEW.fub_stage_due_at := now() + interval '1 minute';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS openhouse_visitor_note_due ON public.open_house_visitors;
CREATE TRIGGER openhouse_visitor_note_due
BEFORE UPDATE ON public.open_house_visitors
FOR EACH ROW EXECUTE FUNCTION public.openhouse_mark_fub_note_due();
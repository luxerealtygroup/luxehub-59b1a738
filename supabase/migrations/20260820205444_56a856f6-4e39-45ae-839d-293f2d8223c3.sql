-- 1. Version history table for Launchpad slides
CREATE TABLE public.launchpad_slide_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_id uuid NOT NULL REFERENCES public.launchpad_slides(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.launchpad_modules(id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  title text NOT NULL,
  slide_type text NOT NULL,
  body text NOT NULL,
  changed_by uuid,
  version_number integer NOT NULL DEFAULT 1,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_launchpad_slide_versions_slide ON public.launchpad_slide_versions(slide_id, changed_at DESC);
CREATE INDEX idx_launchpad_slide_versions_module ON public.launchpad_slide_versions(module_id);

GRANT SELECT ON public.launchpad_slide_versions TO authenticated;
GRANT ALL ON public.launchpad_slide_versions TO service_role;
ALTER TABLE public.launchpad_slide_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view slide history" ON public.launchpad_slide_versions
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));

CREATE TRIGGER update_launchpad_slide_versions_updated_at
  BEFORE UPDATE ON public.launchpad_slide_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Capture function: snapshot OLD when body/title/type/number actually changes
CREATE OR REPLACE FUNCTION public.capture_launchpad_slide_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by uuid;
  v_next_version integer;
BEGIN
  -- Skip no-op saves: only capture when something actually changed.
  IF NEW.body IS NOT DISTINCT FROM OLD.body
     AND NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.slide_type IS NOT DISTINCT FROM OLD.slide_type
     AND NEW.slide_number IS NOT DISTINCT FROM OLD.slide_number THEN
    RETURN NEW;
  END IF;

  v_changed_by := auth.uid();

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version
    FROM public.launchpad_slide_versions
    WHERE slide_id = OLD.id;

  INSERT INTO public.launchpad_slide_versions
    (slide_id, module_id, slide_number, title, slide_type, body, changed_by, version_number, changed_at)
  VALUES
    (OLD.id, OLD.module_id, OLD.slide_number, OLD.title, OLD.slide_type, OLD.body, v_changed_by, v_next_version, OLD.updated_at);

  RETURN NEW;
END;
$$;

CREATE TRIGGER capture_launchpad_slide_version
  BEFORE UPDATE ON public.launchpad_slides
  FOR EACH ROW EXECUTE FUNCTION public.capture_launchpad_slide_version();

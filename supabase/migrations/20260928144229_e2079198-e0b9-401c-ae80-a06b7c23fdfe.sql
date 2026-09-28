CREATE TABLE public.planning_circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL DEFAULT auth.uid(),
  org_id uuid DEFAULT public.current_user_org_id(),
  plan_year integer NOT NULL DEFAULT 2027,
  circles jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, plan_year)
);
GRANT SELECT, INSERT, UPDATE ON public.planning_circles TO authenticated;
GRANT ALL ON public.planning_circles TO service_role;
ALTER TABLE public.planning_circles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent reads own circles" ON public.planning_circles FOR SELECT TO authenticated
  USING (agent_id = auth.uid());
CREATE POLICY "Company plan owner reads circles" ON public.planning_circles FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND public.is_company_plan_viewer(org_id));
CREATE POLICY "Agent inserts own circles" ON public.planning_circles FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid());
CREATE POLICY "Agent updates own circles" ON public.planning_circles FOR UPDATE TO authenticated
  USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

CREATE OR REPLACE FUNCTION public.planning_circles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; v jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.agent_id := OLD.agent_id; NEW.org_id := OLD.org_id; NEW.plan_year := OLD.plan_year;
    ELSE
      NEW.agent_id := auth.uid(); NEW.org_id := public.current_user_org_id();
    END IF;
    IF now() > public.planning_deadline(NEW.org_id, NEW.plan_year) THEN
      RAISE EXCEPTION 'The submission deadline has passed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.planning_goals g WHERE g.agent_id = NEW.agent_id
               AND g.plan_year = NEW.plan_year AND g.status = 'approved') THEN
      RAISE EXCEPTION 'This plan has been approved and is locked';
    END IF;
  END IF;
  FOR k, v IN SELECT * FROM jsonb_each(COALESCE(NEW.circles, '{}'::jsonb)) LOOP
    IF k NOT IN ('spiritual','physical','personal','relationships','job','business','financial') THEN
      RAISE EXCEPTION 'Unknown circle %', k;
    END IF;
    IF (v ? 'today' AND jsonb_typeof(v->'today') = 'number' AND ((v->>'today')::numeric NOT BETWEEN 1 AND 10))
       OR (v ? 'target' AND jsonb_typeof(v->'target') = 'number' AND ((v->>'target')::numeric NOT BETWEEN 1 AND 10)) THEN
      RAISE EXCEPTION 'Scores must be between 1 and 10';
    END IF;
  END LOOP;
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    NEW.submitted_at := now();
  ELSIF NEW.status = 'draft' THEN
    NEW.submitted_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.planning_circles_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER planning_circles_guard BEFORE INSERT OR UPDATE ON public.planning_circles
  FOR EACH ROW EXECUTE FUNCTION public.planning_circles_guard();
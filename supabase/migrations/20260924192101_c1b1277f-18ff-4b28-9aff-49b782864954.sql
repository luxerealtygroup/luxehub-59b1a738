CREATE TABLE public.owner_coaching_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_year int NOT NULL DEFAULT 2027,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  generated_at timestamptz,
  generated_by uuid,
  owner_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_notes_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, plan_year)
);
GRANT SELECT, UPDATE ON public.owner_coaching_notes TO authenticated;
GRANT ALL ON public.owner_coaching_notes TO service_role;
ALTER TABLE public.owner_coaching_notes ENABLE ROW LEVEL SECURITY;

-- Only users listed on the org's Company Plan (Kristen) can see or edit these notes.
CREATE OR REPLACE FUNCTION public.is_company_plan_viewer(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_plans cp WHERE cp.org_id = _org AND auth.uid() = ANY(cp.allowed_user_ids))
$$;
REVOKE EXECUTE ON FUNCTION public.is_company_plan_viewer(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_company_plan_viewer(uuid) TO authenticated;

CREATE POLICY "Company plan owner reads coaching notes" ON public.owner_coaching_notes
  FOR SELECT TO authenticated USING (public.is_company_plan_viewer(org_id));
CREATE POLICY "Company plan owner edits own notes" ON public.owner_coaching_notes
  FOR UPDATE TO authenticated USING (public.is_company_plan_viewer(org_id)) WITH CHECK (public.is_company_plan_viewer(org_id));

-- Browser edits may only touch owner_notes; the AI draft is written by the server only.
CREATE OR REPLACE FUNCTION public.owner_coaching_notes_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '') <> 'service_role' THEN
    NEW.draft := OLD.draft; NEW.facts := OLD.facts; NEW.model := OLD.model;
    NEW.generated_at := OLD.generated_at; NEW.generated_by := OLD.generated_by;
    NEW.org_id := OLD.org_id; NEW.plan_year := OLD.plan_year;
    NEW.owner_notes_updated_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER owner_coaching_notes_guard BEFORE UPDATE ON public.owner_coaching_notes
  FOR EACH ROW EXECUTE FUNCTION public.owner_coaching_notes_guard();
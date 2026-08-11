-- 1. Profiles: new columns
ALTER TABLE public.profiles
  ADD COLUMN launchpad_track text CHECK (launchpad_track IN ('junior','associate')),
  ADD COLUMN mentor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_mentor_id ON public.profiles(mentor_id);

-- 2. Guard trigger (Option A): only admins/owners may change track or mentor
CREATE OR REPLACE FUNCTION public.guard_launchpad_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.launchpad_track IS DISTINCT FROM OLD.launchpad_track
      OR NEW.mentor_id IS DISTINCT FROM OLD.mentor_id)
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can change Launchpad track or mentor assignment';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_launchpad_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_launchpad_profile_fields();

-- 3. Mentor helper
CREATE OR REPLACE FUNCTION public.is_mentor_of(_agent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _agent_id AND mentor_id = auth.uid()
  )
$$;

-- 4. launchpad_modules
CREATE TABLE public.launchpad_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_number integer NOT NULL,
  title text NOT NULL,
  subtitle text,
  track text NOT NULL CHECK (track IN ('junior','associate','unified')),
  day_range_start integer NOT NULL,
  day_range_end integer NOT NULL,
  kind text NOT NULL DEFAULT 'module' CHECK (kind IN ('module','reference')),
  has_practice_assignment boolean NOT NULL DEFAULT true,
  has_knowledge_check boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_number, track)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.launchpad_modules TO authenticated;
GRANT ALL ON public.launchpad_modules TO service_role;
ALTER TABLE public.launchpad_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view modules" ON public.launchpad_modules
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Admins manage modules" ON public.launchpad_modules
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_launchpad_modules_updated_at
  BEFORE UPDATE ON public.launchpad_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. launchpad_slides
CREATE TABLE public.launchpad_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.launchpad_modules(id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  title text NOT NULL,
  slide_type text NOT NULL DEFAULT 'content' CHECK (slide_type IN ('content','practice_assignment','knowledge_check')),
  body text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, slide_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.launchpad_slides TO authenticated;
GRANT ALL ON public.launchpad_slides TO service_role;
ALTER TABLE public.launchpad_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view slides" ON public.launchpad_slides
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Admins manage slides" ON public.launchpad_slides
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_launchpad_slides_updated_at
  BEFORE UPDATE ON public.launchpad_slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_launchpad_slides_module ON public.launchpad_slides(module_id, slide_number);

-- 6. launchpad_progress (per slide)
CREATE TABLE public.launchpad_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_id uuid NOT NULL REFERENCES public.launchpad_modules(id) ON DELETE CASCADE,
  slide_id uuid NOT NULL REFERENCES public.launchpad_slides(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slide_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.launchpad_progress TO authenticated;
GRANT ALL ON public.launchpad_progress TO service_role;
ALTER TABLE public.launchpad_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own progress select" ON public.launchpad_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_mentor_of(user_id) OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Own progress insert" ON public.launchpad_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own progress update" ON public.launchpad_progress
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own progress delete" ON public.launchpad_progress
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_launchpad_progress_updated_at
  BEFORE UPDATE ON public.launchpad_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. launchpad_module_progress (rollup)
CREATE TABLE public.launchpad_module_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_id uuid NOT NULL REFERENCES public.launchpad_modules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed')),
  last_slide_number integer NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.launchpad_module_progress TO authenticated;
GRANT ALL ON public.launchpad_module_progress TO service_role;
ALTER TABLE public.launchpad_module_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own module progress select" ON public.launchpad_module_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_mentor_of(user_id) OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Own module progress insert" ON public.launchpad_module_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own module progress update" ON public.launchpad_module_progress
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own module progress delete" ON public.launchpad_module_progress
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_launchpad_module_progress_updated_at
  BEFORE UPDATE ON public.launchpad_module_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Seed 20 module rows
INSERT INTO public.launchpad_modules
  (module_number, title, subtitle, track, day_range_start, day_range_end, kind, has_practice_assignment, has_knowledge_check, sort_order)
VALUES
  (1,'Company Systems & Tools 101',NULL,'junior',1,15,'module',true,true,10),
  (1,'Company Systems & Tools 101',NULL,'associate',1,15,'module',true,true,10),
  (12,'Agent Safety & Personal Security',NULL,'unified',1,15,'module',true,true,20),
  (2,'Human Rights & Legal Basics',NULL,'unified',1,15,'module',true,true,30),
  (3,'CRM & Lead Follow-Up',NULL,'junior',16,45,'module',true,true,40),
  (3,'CRM & Lead Follow-Up',NULL,'associate',16,45,'module',true,true,40),
  (4,'Buyer Consultation to Close',NULL,'junior',16,45,'module',true,true,50),
  (4,'Buyer Consultation to Close',NULL,'associate',16,45,'module',true,true,50),
  (5,'Listing/Seller Consultation',NULL,'junior',16,45,'module',true,true,60),
  (5,'Listing/Seller Consultation',NULL,'associate',16,45,'module',true,true,60),
  (6,'Contracts & Paperwork',NULL,'junior',16,45,'module',true,true,70),
  (6,'Contracts & Paperwork',NULL,'associate',16,45,'module',true,true,70),
  (7,'Transaction Coordination Workflow',NULL,'junior',16,45,'module',true,true,80),
  (7,'Transaction Coordination Workflow',NULL,'associate',16,45,'module',true,true,80),
  (8,'Negotiation Fundamentals','Negotiation','junior',16,45,'module',true,true,90),
  (8,'Negotiation Scriptbook','Negotiation','associate',16,45,'module',true,true,90),
  (9,'Marketing & Branding Standards',NULL,'junior',46,75,'module',true,true,100),
  (9,'Marketing & Branding Standards',NULL,'associate',46,75,'module',true,true,100),
  (10,'Vendor & Preferred Partner Contact List','Reference document','unified',46,75,'reference',false,false,110),
  (11,'Business Planning & Goal Setting',NULL,'unified',76,90,'module',true,true,120);

-- 9. Placeholder slides (empty bodies)
INSERT INTO public.launchpad_slides (module_id, slide_number, title, slide_type)
SELECT m.id, s.n, s.title, s.slide_type
FROM public.launchpad_modules m
CROSS JOIN LATERAL (
  VALUES (1,'Overview','content'), (2,'Key Concepts','content'), (3,'Putting It Into Practice','content')
) AS s(n, title, slide_type);

INSERT INTO public.launchpad_slides (module_id, slide_number, title, slide_type)
SELECT m.id, 4, 'Practice Assignment', 'practice_assignment'
FROM public.launchpad_modules m WHERE m.has_practice_assignment;

INSERT INTO public.launchpad_slides (module_id, slide_number, title, slide_type)
SELECT m.id, 5, 'Knowledge Check', 'knowledge_check'
FROM public.launchpad_modules m WHERE m.has_knowledge_check;
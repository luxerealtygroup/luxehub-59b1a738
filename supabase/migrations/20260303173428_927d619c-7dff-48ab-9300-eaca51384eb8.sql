
CREATE TABLE public.business_planning_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year integer NOT NULL DEFAULT EXTRACT(year FROM now()),
  quarter integer NOT NULL,
  wins_ytd text,
  biggest_bottleneck text,
  what_avoiding text,
  confidence integer DEFAULT 5,
  stress integer DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, quarter)
);

ALTER TABLE public.business_planning_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reflections" ON public.business_planning_reflections
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert own reflections" ON public.business_planning_reflections
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reflections" ON public.business_planning_reflections
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reflections" ON public.business_planning_reflections
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

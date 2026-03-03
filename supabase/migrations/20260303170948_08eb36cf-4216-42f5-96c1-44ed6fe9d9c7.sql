
-- Planning reflections table (stores quarterly reflections per agent)
CREATE TABLE public.planning_reflections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL DEFAULT EXTRACT(year FROM now()),
  quarter INTEGER NOT NULL,
  what_worked TEXT,
  what_didnt_work TEXT,
  best_lead_source TEXT,
  avoided_activity TEXT,
  negative_habits TEXT,
  single_improvement TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, quarter)
);

ALTER TABLE public.planning_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reflections" ON public.planning_reflections
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert own reflections" ON public.planning_reflections
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reflections" ON public.planning_reflections
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reflections" ON public.planning_reflections
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Planning assumptions table (stores planning mode manual inputs)
CREATE TABLE public.planning_assumptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL DEFAULT EXTRACT(year FROM now()),
  quarter INTEGER NOT NULL DEFAULT 2,
  gci_target NUMERIC NOT NULL DEFAULT 0,
  avg_commission NUMERIC NOT NULL DEFAULT 0,
  split_percent NUMERIC NOT NULL DEFAULT 100,
  avg_sale_price NUMERIC NOT NULL DEFAULT 0,
  contact_to_appt_rate NUMERIC NOT NULL DEFAULT 20,
  appt_to_contract_rate NUMERIC NOT NULL DEFAULT 25,
  cma_to_listing_rate NUMERIC NOT NULL DEFAULT 30,
  dials_to_appt_rate NUMERIC NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, quarter)
);

ALTER TABLE public.planning_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own assumptions" ON public.planning_assumptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert own assumptions" ON public.planning_assumptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assumptions" ON public.planning_assumptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own assumptions" ON public.planning_assumptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

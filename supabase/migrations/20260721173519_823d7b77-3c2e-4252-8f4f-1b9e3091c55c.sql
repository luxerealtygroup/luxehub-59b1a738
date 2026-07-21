
CREATE TABLE public.pipeline_gap_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  quarterly_goal NUMERIC NOT NULL DEFAULT 0,
  fallout_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, quarter)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_gap_settings TO authenticated;
GRANT ALL ON public.pipeline_gap_settings TO service_role;

ALTER TABLE public.pipeline_gap_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own gap settings"
  ON public.pipeline_gap_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Users insert own gap settings"
  ON public.pipeline_gap_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own gap settings"
  ON public.pipeline_gap_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own gap settings"
  ON public.pipeline_gap_settings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_pipeline_gap_settings_updated_at
  BEFORE UPDATE ON public.pipeline_gap_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

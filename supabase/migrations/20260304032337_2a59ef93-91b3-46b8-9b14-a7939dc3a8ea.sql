
-- Recruiting pipeline tracking table
CREATE TABLE public.recruiting_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL DEFAULT EXTRACT(year FROM now()),
  quarter integer NOT NULL DEFAULT EXTRACT(quarter FROM now()),
  recruiting_leads integer NOT NULL DEFAULT 0,
  interviews integer NOT NULL DEFAULT 0,
  offers integer NOT NULL DEFAULT 0,
  accepted integer NOT NULL DEFAULT 0,
  avg_agent_production integer NOT NULL DEFAULT 8,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  UNIQUE(year, quarter)
);

-- Enable RLS
ALTER TABLE public.recruiting_pipeline ENABLE ROW LEVEL SECURITY;

-- Only admins can manage recruiting pipeline
CREATE POLICY "Admins can manage recruiting pipeline"
  ON public.recruiting_pipeline
  FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

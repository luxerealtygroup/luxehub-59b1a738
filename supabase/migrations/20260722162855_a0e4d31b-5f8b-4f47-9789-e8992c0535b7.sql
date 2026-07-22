CREATE TABLE public.cma_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cma_generations_org_created ON public.cma_generations(org_id, created_at DESC);

GRANT SELECT ON public.cma_generations TO authenticated;
GRANT ALL ON public.cma_generations TO service_role;

ALTER TABLE public.cma_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's CMA generations"
ON public.cma_generations FOR SELECT
TO authenticated
USING (
  org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);
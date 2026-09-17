CREATE TABLE public.account_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  actor_email text,
  actor_full_name text,
  actor_role text NOT NULL,
  org_id uuid,
  org_name text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.account_deletion_log TO authenticated;
GRANT ALL ON public.account_deletion_log TO service_role;

ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team admins can read their org deletion log"
ON public.account_deletion_log
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    org_id IS NOT NULL
    AND org_id = public.current_user_org_id()
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'))
  )
);

CREATE INDEX idx_account_deletion_log_org ON public.account_deletion_log(org_id, created_at DESC);
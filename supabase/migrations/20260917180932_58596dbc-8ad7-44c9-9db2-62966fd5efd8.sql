CREATE TABLE public.pipeline_client_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id),
  client_id uuid NOT NULL REFERENCES public.pipeline_clients(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pipeline_client_audit TO authenticated;
GRANT ALL ON public.pipeline_client_audit TO service_role;

ALTER TABLE public.pipeline_client_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner agent and admins read client audit"
  ON public.pipeline_client_audit FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (owner_user_id = auth.uid() OR changed_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  );

CREATE POLICY "Staff insert client audit for own team"
  ON public.pipeline_client_audit FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND org_id = public.current_user_org_id()
  );

CREATE INDEX idx_pipeline_client_audit_client ON public.pipeline_client_audit(client_id, created_at DESC);
CREATE INDEX idx_pipeline_client_audit_owner ON public.pipeline_client_audit(owner_user_id);

CREATE TRIGGER set_org_id_on_insert
  BEFORE INSERT ON public.pipeline_client_audit
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_context();

ALTER TABLE public.pipeline_clients
  ADD COLUMN IF NOT EXISTS fub_deal_id bigint,
  ADD COLUMN IF NOT EXISTS fub_deal_name text,
  ADD COLUMN IF NOT EXISTS fub_deal_pipeline text,
  ADD COLUMN IF NOT EXISTS fub_deal_stage text,
  ADD COLUMN IF NOT EXISTS fub_deal_price numeric,
  ADD COLUMN IF NOT EXISTS fub_deal_close_date date,
  ADD COLUMN IF NOT EXISTS fub_deal_linked_by uuid,
  ADD COLUMN IF NOT EXISTS fub_deal_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pipeline_clients_fub_deal ON public.pipeline_clients(fub_deal_id);
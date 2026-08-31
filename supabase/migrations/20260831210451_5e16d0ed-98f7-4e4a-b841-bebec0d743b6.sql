CREATE TABLE public.portal_fub_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  fub_deal_id bigint NOT NULL,
  deal_name text,
  pipeline_name text,
  last_seen_stage text,
  dismissed_stage text,
  linked_property_id uuid REFERENCES public.portal_properties(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_id, fub_deal_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_fub_deals TO authenticated;
GRANT ALL ON public.portal_fub_deals TO service_role;

ALTER TABLE public.portal_fub_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents and admins read portal fub deals"
ON public.portal_fub_deals FOR SELECT TO authenticated
USING (public.owns_portal(portal_id, auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Agents and admins insert portal fub deals"
ON public.portal_fub_deals FOR INSERT TO authenticated
WITH CHECK (public.owns_portal(portal_id, auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Agents and admins update portal fub deals"
ON public.portal_fub_deals FOR UPDATE TO authenticated
USING (public.owns_portal(portal_id, auth.uid()) OR public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.owns_portal(portal_id, auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Agents and admins delete portal fub deals"
ON public.portal_fub_deals FOR DELETE TO authenticated
USING (public.owns_portal(portal_id, auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE INDEX idx_portal_fub_deals_portal ON public.portal_fub_deals(portal_id);

CREATE TRIGGER update_portal_fub_deals_updated_at
BEFORE UPDATE ON public.portal_fub_deals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
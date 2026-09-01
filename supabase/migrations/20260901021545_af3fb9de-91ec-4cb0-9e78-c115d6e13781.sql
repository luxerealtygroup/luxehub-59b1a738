CREATE TABLE public.portal_key_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.portal_properties(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.portal_transactions(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other',
  custom_label text,
  event_date date NOT NULL,
  event_time time,
  notes text,
  is_internal boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_key_dates TO authenticated;
GRANT ALL ON public.portal_key_dates TO service_role;

ALTER TABLE public.portal_key_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_key_dates select" ON public.portal_key_dates
FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR (public.owns_portal(portal_id, auth.uid()) AND is_internal = false)
);

CREATE POLICY "portal_key_dates insert" ON public.portal_key_dates
FOR INSERT TO authenticated
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

CREATE POLICY "portal_key_dates update" ON public.portal_key_dates
FOR UPDATE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()))
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

CREATE POLICY "portal_key_dates delete" ON public.portal_key_dates
FOR DELETE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()));

CREATE INDEX portal_key_dates_portal_idx ON public.portal_key_dates(portal_id, event_date);

CREATE TRIGGER update_portal_key_dates_updated_at
BEFORE UPDATE ON public.portal_key_dates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- 1. Properties on a portal -------------------------------------------------
CREATE TABLE public.portal_properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portal_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  address TEXT,
  mls_number TEXT,
  property_type TEXT,
  cover_photo_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'listing' CHECK (role IN ('listing', 'purchase', 'watching')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_properties_portal ON public.portal_properties(portal_id, display_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_properties TO authenticated;
GRANT ALL ON public.portal_properties TO service_role;
ALTER TABLE public.portal_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_properties select" ON public.portal_properties
FOR SELECT TO authenticated
USING (
  public.is_team_member(auth.uid())
  OR public.is_admin_or_owner(auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);

CREATE POLICY "portal_properties insert" ON public.portal_properties
FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "portal_properties update" ON public.portal_properties
FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid()) OR public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_team_member(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "portal_properties delete" ON public.portal_properties
FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_portal_properties_updated_at
BEFORE UPDATE ON public.portal_properties
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Transactions on a property ----------------------------------------------
CREATE TABLE public.portal_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portal_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.portal_properties(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  status TEXT NOT NULL DEFAULT 'active',
  price NUMERIC,
  offer_date DATE,
  conditions_date DATE,
  firm_date DATE,
  closing_date DATE,
  fub_deal_id BIGINT,
  deal_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_transactions_portal ON public.portal_transactions(portal_id);
CREATE INDEX idx_portal_transactions_property ON public.portal_transactions(property_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_transactions TO authenticated;
GRANT ALL ON public.portal_transactions TO service_role;
ALTER TABLE public.portal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_transactions select" ON public.portal_transactions
FOR SELECT TO authenticated
USING (
  public.is_team_member(auth.uid())
  OR public.is_admin_or_owner(auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);

CREATE POLICY "portal_transactions insert" ON public.portal_transactions
FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "portal_transactions update" ON public.portal_transactions
FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid()) OR public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_team_member(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "portal_transactions delete" ON public.portal_transactions
FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_portal_transactions_updated_at
BEFORE UPDATE ON public.portal_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Optional property scoping on portal content ------------------------------
-- NULL keeps a row portal-wide ("General"), which is what every existing row is.
ALTER TABLE public.portal_documents
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.portal_properties(id) ON DELETE SET NULL;
ALTER TABLE public.portal_photos
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.portal_properties(id) ON DELETE SET NULL;
ALTER TABLE public.client_tasks
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.portal_properties(id) ON DELETE SET NULL;
ALTER TABLE public.portal_timeline_notes
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.portal_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portal_documents_property ON public.portal_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_portal_photos_property ON public.portal_photos(property_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_property ON public.client_tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_portal_timeline_notes_property ON public.portal_timeline_notes(property_id);

-- 4. Migrate existing single-property portals ---------------------------------
-- 4a. Portals that already have client_transactions rows: one property +
--     one transaction per existing row, preserving address, dates and prices.
WITH inserted AS (
  INSERT INTO public.portal_properties (portal_id, address, display_order, role, created_at)
  SELECT t.client_account_id,
         t.property_address,
         (row_number() OVER (PARTITION BY t.client_account_id ORDER BY t.created_at)) - 1,
         CASE WHEN t.transaction_type IN ('buyer', 'purchase') THEN 'purchase' ELSE 'listing' END,
         t.created_at
  FROM public.client_transactions t
  RETURNING id, portal_id, address
)
INSERT INTO public.portal_transactions
  (portal_id, property_id, side, status, price, offer_date, closing_date, fub_deal_id, deal_id, created_at)
SELECT t.client_account_id,
       i.id,
       CASE WHEN t.transaction_type IN ('buyer', 'purchase') THEN 'buy' ELSE 'sell' END,
       t.status,
       COALESCE(t.sale_price, t.list_price),
       t.offer_date,
       t.closing_date,
       t.fub_deal_id,
       t.deal_id,
       t.created_at
FROM public.client_transactions t
JOIN inserted i
  ON i.portal_id = t.client_account_id
 AND i.address IS NOT DISTINCT FROM t.property_address;

-- 4b. Portals with only a legacy deal type and no transaction row: one
--     placeholder property carrying that side, so the derived badge matches
--     what the portal shows today. Address is left blank for the agent to fill.
WITH inserted AS (
  INSERT INTO public.portal_properties (portal_id, address, display_order, role)
  SELECT ca.id,
         NULL,
         0,
         CASE WHEN lower(ca.client_type) = 'buyer' THEN 'purchase' ELSE 'listing' END
  FROM public.client_accounts ca
  WHERE ca.client_type IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.portal_properties p WHERE p.portal_id = ca.id)
  RETURNING id, portal_id, role
)
INSERT INTO public.portal_transactions (portal_id, property_id, side, status)
SELECT i.portal_id, i.id, CASE WHEN i.role = 'purchase' THEN 'buy' ELSE 'sell' END, 'active'
FROM inserted i;

-- 5. Derived buyer/seller badge ------------------------------------------------
CREATE OR REPLACE VIEW public.portal_sides
WITH (security_invoker = true) AS
SELECT ca.id AS portal_id,
       bool_or(tr.side = 'buy')  AS has_buy,
       bool_or(tr.side = 'sell') AS has_sell
FROM public.client_accounts ca
LEFT JOIN public.portal_transactions tr ON tr.portal_id = ca.id
GROUP BY ca.id;

GRANT SELECT ON public.portal_sides TO authenticated;
GRANT ALL ON public.portal_sides TO service_role;
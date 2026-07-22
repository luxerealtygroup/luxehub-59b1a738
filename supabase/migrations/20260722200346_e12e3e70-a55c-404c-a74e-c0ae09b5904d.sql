
-- 1. Add org_id to training_documents and important_documents
ALTER TABLE public.training_documents ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.important_documents ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill from uploader's profile.org_id, falling back to Luxe
UPDATE public.training_documents td
SET org_id = COALESCE(p.org_id, 'e4295d7b-c889-459f-81ef-4ee90bc939a7'::uuid)
FROM public.profiles p
WHERE p.id = td.uploaded_by AND td.org_id IS NULL;

UPDATE public.training_documents SET org_id = 'e4295d7b-c889-459f-81ef-4ee90bc939a7'::uuid WHERE org_id IS NULL;

UPDATE public.important_documents id_
SET org_id = COALESCE(p.org_id, 'e4295d7b-c889-459f-81ef-4ee90bc939a7'::uuid)
FROM public.profiles p
WHERE p.id = id_.uploaded_by AND id_.org_id IS NULL;

UPDATE public.important_documents SET org_id = 'e4295d7b-c889-459f-81ef-4ee90bc939a7'::uuid WHERE org_id IS NULL;

ALTER TABLE public.training_documents ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.important_documents ALTER COLUMN org_id SET NOT NULL;

-- Auto-fill org_id from uploader's profile on insert
CREATE OR REPLACE FUNCTION public.set_doc_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE id = NEW.uploaded_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_on_training_docs ON public.training_documents;
CREATE TRIGGER set_org_id_on_training_docs
  BEFORE INSERT ON public.training_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_doc_org_id();

DROP TRIGGER IF EXISTS set_org_id_on_important_docs ON public.important_documents;
CREATE TRIGGER set_org_id_on_important_docs
  BEFORE INSERT ON public.important_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_doc_org_id();

-- Helper to get current user's org
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Replace SELECT policies to scope by org
DROP POLICY IF EXISTS "All users can view training documents" ON public.training_documents;
CREATE POLICY "Org members can view training documents"
  ON public.training_documents FOR SELECT
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "All users can view important documents" ON public.important_documents;
CREATE POLICY "Org members can view important documents"
  ON public.important_documents FOR SELECT
  USING (org_id = public.current_user_org_id());

-- 2. Create org_resources table
CREATE TABLE IF NOT EXISTS public.org_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('listings','buyers','commercial','tenants','landlords','newsletters')),
  title text NOT NULL,
  description text,
  href text NOT NULL,
  icon text NOT NULL DEFAULT 'FileText',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_resources_org_category_idx ON public.org_resources(org_id, category, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_resources TO authenticated;
GRANT ALL ON public.org_resources TO service_role;

ALTER TABLE public.org_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view resources"
  ON public.org_resources FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "Admins can insert org resources"
  ON public.org_resources FOR INSERT
  WITH CHECK (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update org resources"
  ON public.org_resources FOR UPDATE
  USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can delete org resources"
  ON public.org_resources FOR DELETE
  USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_org_resources_updated_at
  BEFORE UPDATE ON public.org_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Seed Luxe's existing content
INSERT INTO public.org_resources (org_id, category, title, description, href, icon, sort_order) VALUES
-- Listings
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','Seller Guide Flipbook','Interactive online flipbook version of the Selling Your Home guide.','https://simplebooklet.com/luxerealtygroupsellingyourhome','BookOpen',10),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','Selling Your Home (PDF)','Downloadable PDF of the LUXE Realty Group seller guide.','/resources/LUXERealtyGroup-SellingYourHome.pdf','FileText',20),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','Schedule A – Listing (PDF)','LUXE Schedule A for listing agreements.','/resources/listings/Schedule-A-Listing.pdf','FileText',30),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','Schedule A – Seller (DOCX)','Editable Word version of Schedule A for sellers.','/resources/listings/Schedule-A-Seller.docx','FileText',40),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','Deposit Instructions','Submit Ontario deposit instructions via eXp Realty form.','https://exprealty.formstack.com/forms/ontario_deposit','ClipboardList',50),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','Clause Generator','Ontario eXp Transaction Guide clause generator.','https://exptransactionguide.com/ON/clause-generator','Wand2',60),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','Transaction Checklists','Ontario eXp Transaction Guide checklists.','https://exptransactionguide.com/ON/transaction-checklists','ListChecks',70),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','Schedule B1 (PDF)','Schedule B1 for listing transactions.','/resources/buyers/Schedule-B1.pdf','FileText',80),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','listings','OREA Forms Explained','Official OREA explanations of standard forms and clauses.','https://www.orea.com/standard-forms-clauses?category=Forms%20Explained#standard-forms','HelpCircle',90),
-- Buyers
('e4295d7b-c889-459f-81ef-4ee90bc939a7','buyers','Ontario 303 – Buyer Representation Agreement','LUXE Schedule A – Buyer Representation Agreement.','/resources/buyers/Ontario-303-Buyer-Representation-Agreement.pdf','FileText',10),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','buyers','Schedule A – Buyer (DOCX)','Editable Word version of Schedule A for buyers.','/resources/buyers/Schedule-A-Buyer.docx','FileText',20),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','buyers','Clause Generator','Ontario eXp Transaction Guide clause generator.','https://exptransactionguide.com/ON/clause-generator','Wand2',30),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','buyers','Transaction Checklists','Ontario eXp Transaction Guide checklists.','https://exptransactionguide.com/ON/transaction-checklists','ListChecks',40),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','buyers','OREA Forms Explained','Official OREA explanations of standard forms and clauses.','https://www.orea.com/standard-forms-clauses?category=Forms%20Explained#standard-forms','HelpCircle',50),
-- Commercial
('e4295d7b-c889-459f-81ef-4ee90bc939a7','commercial','Form 547 — Tenant Representation Schedule','Ontario commercial tenant representation agreement schedule (PDF).','/resources/commercial/ontario-547-tenant-representation-schedule.pdf','FileText',10),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','commercial','Form 594 — Listing Agreement (Landlord)','Ontario commercial listing agreement — landlord designated representation (PDF).','/resources/commercial/ontario-594-listing-agreement-landlord.pdf','FileText',20),
-- Tenants
('e4295d7b-c889-459f-81ef-4ee90bc939a7','tenants','LeaseWithLuxe','Tenant leasing portal and application workflow.','https://leasewithluxe.lovable.app','Key',10),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','tenants','Form 372 — Tenant Representation (Lease)','Ontario tenant designated representation agreement — authority for lease (PDF).','/resources/tenants/ontario-372-tenant-representation-authority-for-lease.pdf','FileText',20),
-- Landlords
('e4295d7b-c889-459f-81ef-4ee90bc939a7','landlords','Ontario 211 – Schedule','Schedule – Listing Agreement – Authority to Offer for Lease.','/resources/landlords/Ontario-211-Schedule.pdf','FileText',10),
-- Newsletters
('e4295d7b-c889-459f-81ef-4ee90bc939a7','newsletters','Hamilton Region','Market report for the Hamilton Region.','https://simplebooklet.com/marketreporthamiltonregion','Newspaper',10),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','newsletters','Norfolk County','Market report for Norfolk County.','https://simplebooklet.com/marketreportnorfolkcounty','Newspaper',20),
('e4295d7b-c889-459f-81ef-4ee90bc939a7','newsletters','Waterloo Region','Market report for the Waterloo Region.','https://simplebooklet.com/marketreportwaterlooregion','Newspaper',30);

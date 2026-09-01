-- 1. Document library vs transaction paperwork
ALTER TABLE public.portal_documents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'transaction';

ALTER TABLE public.portal_documents
  DROP CONSTRAINT IF EXISTS portal_documents_source_check;
ALTER TABLE public.portal_documents
  ADD CONSTRAINT portal_documents_source_check CHECK (source IN ('transaction','library'));

ALTER TABLE public.portal_documents
  ADD COLUMN IF NOT EXISTS category text;

DROP POLICY IF EXISTS "portal_documents client library insert" ON public.portal_documents;
CREATE POLICY "portal_documents client library insert"
ON public.portal_documents FOR INSERT TO authenticated
WITH CHECK (
  public.owns_portal(portal_id, auth.uid())
  AND source = 'library'
  AND is_internal = false
  AND uploaded_by = auth.uid()
);

DROP POLICY IF EXISTS "portal_documents client library delete" ON public.portal_documents;
CREATE POLICY "portal_documents client library delete"
ON public.portal_documents FOR DELETE TO authenticated
USING (
  public.owns_portal(portal_id, auth.uid())
  AND source = 'library'
  AND uploaded_by = auth.uid()
);

DROP POLICY IF EXISTS "portal_documents client library update" ON public.portal_documents;
CREATE POLICY "portal_documents client library update"
ON public.portal_documents FOR UPDATE TO authenticated
USING (
  public.owns_portal(portal_id, auth.uid())
  AND source = 'library'
  AND uploaded_by = auth.uid()
)
WITH CHECK (
  public.owns_portal(portal_id, auth.uid())
  AND source = 'library'
  AND is_internal = false
);

DROP POLICY IF EXISTS "portal_documents agent insert" ON public.portal_documents;
CREATE POLICY "portal_documents agent insert"
ON public.portal_documents FOR INSERT TO authenticated
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "portal_documents agent delete" ON public.portal_documents;
CREATE POLICY "portal_documents agent delete"
ON public.portal_documents FOR DELETE TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()));

-- 2. Storage: let a client write into their own portal folder
DROP POLICY IF EXISTS "portal docs client insert" ON storage.objects;
CREATE POLICY "portal docs client insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'portal-documents'
  AND public.owns_portal(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
);

DROP POLICY IF EXISTS "portal docs client delete" ON storage.objects;
CREATE POLICY "portal docs client delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'portal-documents'
  AND public.owns_portal(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
);

DROP POLICY IF EXISTS "portal docs agent insert" ON storage.objects;
CREATE POLICY "portal docs agent insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('portal-documents','portal-photos')
  AND public.can_access_portal(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
);

DROP POLICY IF EXISTS "portal docs agent delete" ON storage.objects;
CREATE POLICY "portal docs agent delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('portal-documents','portal-photos')
  AND public.can_access_portal(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
);

-- 3. Important contacts
CREATE TABLE IF NOT EXISTS public.portal_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.portal_properties(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text,
  company text,
  phone text,
  email text,
  website text,
  notes text,
  is_internal boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_contacts TO authenticated;
GRANT ALL ON public.portal_contacts TO service_role;

ALTER TABLE public.portal_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_contacts select" ON public.portal_contacts;
CREATE POLICY "portal_contacts select"
ON public.portal_contacts FOR SELECT TO authenticated
USING (
  public.can_access_portal(portal_id, auth.uid())
  OR (public.owns_portal(portal_id, auth.uid()) AND is_internal = false)
);

DROP POLICY IF EXISTS "portal_contacts agent write" ON public.portal_contacts;
CREATE POLICY "portal_contacts agent write"
ON public.portal_contacts FOR ALL TO authenticated
USING (public.can_access_portal(portal_id, auth.uid()))
WITH CHECK (public.can_access_portal(portal_id, auth.uid()));

DROP POLICY IF EXISTS "portal_contacts client insert" ON public.portal_contacts;
CREATE POLICY "portal_contacts client insert"
ON public.portal_contacts FOR INSERT TO authenticated
WITH CHECK (
  public.owns_portal(portal_id, auth.uid())
  AND is_internal = false
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "portal_contacts client update" ON public.portal_contacts;
CREATE POLICY "portal_contacts client update"
ON public.portal_contacts FOR UPDATE TO authenticated
USING (public.owns_portal(portal_id, auth.uid()) AND created_by = auth.uid())
WITH CHECK (public.owns_portal(portal_id, auth.uid()) AND created_by = auth.uid() AND is_internal = false);

DROP POLICY IF EXISTS "portal_contacts client delete" ON public.portal_contacts;
CREATE POLICY "portal_contacts client delete"
ON public.portal_contacts FOR DELETE TO authenticated
USING (public.owns_portal(portal_id, auth.uid()) AND created_by = auth.uid());

DROP TRIGGER IF EXISTS update_portal_contacts_updated_at ON public.portal_contacts;
CREATE TRIGGER update_portal_contacts_updated_at
BEFORE UPDATE ON public.portal_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Safe realtor lookup for the client portal
CREATE OR REPLACE FUNCTION public.get_portal_realtor(_portal_id uuid)
RETURNS TABLE(id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, COALESCE(p.email, u.email::text), p.avatar_url
  FROM public.client_accounts ca
  JOIN public.profiles p ON p.id = ca.invited_by
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE ca.id = _portal_id
    AND (
      public.owns_portal(_portal_id, auth.uid())
      OR public.can_access_portal(_portal_id, auth.uid())
    )
$$;

REVOKE ALL ON FUNCTION public.get_portal_realtor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_portal_realtor(uuid) TO authenticated, service_role;

-- Enum for photo category
DO $$ BEGIN
  CREATE TYPE public.portal_photo_category AS ENUM ('property', 'milestone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: does the current user own this portal (client_account)?
CREATE OR REPLACE FUNCTION public.owns_portal(_portal_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_accounts
    WHERE id = _portal_id AND user_id = _user_id
  );
$$;

-- portal_documents
CREATE TABLE public.portal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_documents TO authenticated;
GRANT ALL ON public.portal_documents TO service_role;
ALTER TABLE public.portal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_documents select" ON public.portal_documents
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'owner')
  OR public.is_team_member(auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);
CREATE POLICY "portal_documents insert" ON public.portal_documents
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
);
CREATE POLICY "portal_documents delete" ON public.portal_documents
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
);

-- portal_photos
CREATE TABLE public.portal_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  caption text,
  category public.portal_photo_category NOT NULL DEFAULT 'property',
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_photos TO authenticated;
GRANT ALL ON public.portal_photos TO service_role;
ALTER TABLE public.portal_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_photos select" ON public.portal_photos
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'owner')
  OR public.is_team_member(auth.uid())
  OR public.owns_portal(portal_id, auth.uid())
);
CREATE POLICY "portal_photos insert" ON public.portal_photos
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
);
CREATE POLICY "portal_photos delete" ON public.portal_photos
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
);

-- Storage RLS for both buckets. Files are keyed as: <portal_id>/...
-- SELECT: admin/owner/team member OR the client that owns the portal (folder name = portal_id)
CREATE POLICY "portal buckets select" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id IN ('portal-documents','portal-photos')
  AND (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'owner')
    OR public.is_team_member(auth.uid())
    OR public.owns_portal(
      NULLIF((storage.foldername(name))[1],'')::uuid,
      auth.uid()
    )
  )
);

CREATE POLICY "portal buckets insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id IN ('portal-documents','portal-photos')
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
);

CREATE POLICY "portal buckets delete" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id IN ('portal-documents','portal-photos')
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
);

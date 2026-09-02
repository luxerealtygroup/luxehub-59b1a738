
-- Stricter portal access: assigned agent (client_accounts.invited_by) or same-org admin/owner
CREATE OR REPLACE FUNCTION public.portal_object_accessible(_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _name IS NULL THEN false
    WHEN split_part(_name, '/', 1) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN false
    ELSE public.can_access_portal(split_part(_name, '/', 1)::uuid, auth.uid())
  END
$$;

DROP POLICY IF EXISTS "portal buckets select" ON storage.objects;
DROP POLICY IF EXISTS "portal buckets insert" ON storage.objects;
DROP POLICY IF EXISTS "portal buckets delete" ON storage.objects;
DROP POLICY IF EXISTS "portal docs agent insert" ON storage.objects;
DROP POLICY IF EXISTS "portal docs agent delete" ON storage.objects;

CREATE POLICY "portal buckets select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['portal-documents','portal-photos'])
  AND (
    owns_portal((NULLIF((storage.foldername(name))[1], ''))::uuid, auth.uid())
    OR public.portal_object_accessible(name)
  )
);

CREATE POLICY "portal buckets insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['portal-documents','portal-photos'])
  AND public.portal_object_accessible(name)
);

CREATE POLICY "portal buckets delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['portal-documents','portal-photos'])
  AND public.portal_object_accessible(name)
);

-- Realtime topics: own-org broadcast topics for team members, portal topics only for
-- the client, their assigned agent, or same-org admin/owner
CREATE OR REPLACE FUNCTION public.topic_in_my_org(_topic text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _topic IS NOT NULL
    AND public.current_user_org_id() IS NOT NULL
    AND (
      _topic LIKE 'org-' || public.current_user_org_id()::text || '%'
      OR EXISTS (
        SELECT 1 FROM public.client_accounts ca
        WHERE ca.org_id = public.current_user_org_id()
          AND _topic LIKE '%' || ca.id::text || '%'
          AND public.can_access_portal(ca.id, auth.uid())
      )
    )
$$;

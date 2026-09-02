
-- Helper: does this storage object path belong to a portal in the caller's org?
CREATE OR REPLACE FUNCTION public.portal_object_in_my_org(_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _name IS NULL THEN false
    WHEN split_part(_name, '/', 1) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.client_accounts ca
      WHERE ca.id = split_part(_name, '/', 1)::uuid
        AND ca.org_id IS NOT NULL
        AND ca.org_id = public.current_user_org_id()
    )
  END
$$;

REVOKE ALL ON FUNCTION public.portal_object_in_my_org(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_object_in_my_org(text) TO authenticated, service_role;

-- Helper: is this realtime topic tied to a portal in the caller's org?
CREATE OR REPLACE FUNCTION public.topic_in_my_org(_topic text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _topic IS NOT NULL
    AND public.current_user_org_id() IS NOT NULL
    AND (
      _topic LIKE 'org-' || public.current_user_org_id()::text || '%'
      OR EXISTS (
        SELECT 1 FROM public.client_accounts ca
        WHERE ca.org_id = public.current_user_org_id()
          AND _topic LIKE '%' || ca.id::text || '%'
      )
    )
$$;

REVOKE ALL ON FUNCTION public.topic_in_my_org(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.topic_in_my_org(text) TO authenticated, service_role;

-- Storage: org-scope the portal buckets
DROP POLICY IF EXISTS "portal buckets select" ON storage.objects;
CREATE POLICY "portal buckets select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['portal-documents','portal-photos'])
  AND (
    public.owns_portal((NULLIF((storage.foldername(name))[1], ''))::uuid, auth.uid())
    OR (public.is_team_member(auth.uid()) AND public.portal_object_in_my_org(name))
  )
);

DROP POLICY IF EXISTS "portal buckets insert" ON storage.objects;
CREATE POLICY "portal buckets insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['portal-documents','portal-photos'])
  AND public.is_team_member(auth.uid())
  AND public.portal_object_in_my_org(name)
);

DROP POLICY IF EXISTS "portal buckets delete" ON storage.objects;
CREATE POLICY "portal buckets delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['portal-documents','portal-photos'])
  AND public.is_team_member(auth.uid())
  AND public.portal_object_in_my_org(name)
);

-- Realtime: org-scope private topic access
DROP POLICY IF EXISTS "Users can use their own Realtime topics" ON realtime.messages;
CREATE POLICY "Users can use their own Realtime topics" ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() = ('notifications-' || (auth.uid())::text)
  OR EXISTS (
    SELECT 1 FROM public.client_accounts ca
    WHERE ca.user_id = auth.uid()
      AND realtime.topic() LIKE '%' || ca.id::text || '%'
  )
  OR (public.is_team_member(auth.uid()) AND public.topic_in_my_org(realtime.topic()))
);

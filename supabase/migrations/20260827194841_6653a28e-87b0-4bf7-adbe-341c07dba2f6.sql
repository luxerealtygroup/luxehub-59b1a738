
-- 1. Fix mutable search_path on email queue helpers
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

-- 2. Revoke direct EXECUTE from anon/authenticated on SECURITY DEFINER functions
--    that are only used by triggers, RLS internals or service-role edge functions.
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_launchpad_profile_fields() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_doc_org_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;

-- anon must never reach org/role/portal helpers
REVOKE EXECUTE ON FUNCTION public.current_user_org_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_agents() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_mentor_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owns_portal(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

-- 3. Storage: scope important-documents and training-library reads to the same org
DROP POLICY IF EXISTS "All users can view important documents storage" ON storage.objects;
CREATE POLICY "Same-org users can view important documents storage"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'important-documents'
  AND (
    public.is_admin_or_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.important_documents d
      WHERE d.file_path = storage.objects.name
        AND d.org_id IS NOT DISTINCT FROM public.current_user_org_id()
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can view training files" ON storage.objects;
CREATE POLICY "Same-org users can view training files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'training-library'
  AND (
    public.is_admin_or_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.training_documents d
      WHERE d.file_path = storage.objects.name
        AND d.org_id IS NOT DISTINCT FROM public.current_user_org_id()
    )
  )
);

-- 4. Realtime: scope private channel access to the user's own topics
DROP POLICY IF EXISTS "Authenticated users can use Realtime" ON realtime.messages;
CREATE POLICY "Users can use their own Realtime topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  public.is_team_member(auth.uid())
  OR realtime.topic() = 'notifications-' || auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.client_accounts ca
    WHERE ca.user_id = auth.uid()
      AND realtime.topic() LIKE '%' || ca.id::text || '%'
  )
);

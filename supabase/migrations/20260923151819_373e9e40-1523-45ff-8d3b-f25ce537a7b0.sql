ALTER TABLE public.portal_messages
  ADD COLUMN IF NOT EXISTS attachment_document_id uuid REFERENCES public.portal_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS portal_messages_attachment_idx
  ON public.portal_messages (attachment_document_id);

CREATE OR REPLACE FUNCTION public.mark_portal_messages_seen(_portal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.owns_portal(_portal_id, auth.uid()) THEN
    RETURN;
  END IF;

  UPDATE public.portal_messages
     SET client_seen_at = now()
   WHERE portal_id = _portal_id
     AND sender_type <> 'client'
     AND is_internal IS NOT TRUE
     AND client_seen_at IS NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_portal_messages_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_portal_messages_seen(uuid) TO authenticated, service_role;
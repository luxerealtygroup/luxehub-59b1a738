-- 1. Versioning on portal documents
ALTER TABLE public.portal_documents
  ADD COLUMN IF NOT EXISTS doc_kind text,
  ADD COLUMN IF NOT EXISTS version_group_id uuid,
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current_version boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

UPDATE public.portal_documents SET version_group_id = id WHERE version_group_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_documents_version_group
  ON public.portal_documents (version_group_id, version_number);

-- 2. History of CMAs delivered to client portals
CREATE TABLE IF NOT EXISTS public.cma_portal_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.cma_reports(id) ON DELETE CASCADE,
  portal_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.portal_documents(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.portal_properties(id) ON DELETE SET NULL,
  version_group_id uuid,
  version_number integer NOT NULL DEFAULT 1,
  property_address text,
  sent_by uuid,
  org_id uuid NOT NULL DEFAULT public.current_user_org_id(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cma_portal_sends TO authenticated;
GRANT ALL ON public.cma_portal_sends TO service_role;

ALTER TABLE public.cma_portal_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view CMA portal sends"
  ON public.cma_portal_sends FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

CREATE POLICY "Team can record CMA portal sends"
  ON public.cma_portal_sends FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id());

CREATE INDEX IF NOT EXISTS idx_cma_portal_sends_report ON public.cma_portal_sends (report_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cma_portal_sends_group ON public.cma_portal_sends (version_group_id, version_number);

CREATE TRIGGER update_cma_portal_sends_updated_at
  BEFORE UPDATE ON public.cma_portal_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Notification / email wording distinguishes a first send from a revision
CREATE OR REPLACE FUNCTION public.notify_client_of_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_user_id uuid;
  v_client_email text;
  v_client_name text;
  v_should_email boolean;
  v_is_revision boolean;
  v_kind_label text;
  v_title text;
  v_doc_name text;
BEGIN
  SELECT user_id, email, full_name
    INTO v_client_user_id, v_client_email, v_client_name
  FROM public.client_accounts WHERE id = NEW.portal_id;

  IF v_client_user_id IS NULL OR v_client_user_id = NEW.uploaded_by THEN
    RETURN NEW;
  END IF;

  v_should_email := public.portal_should_email(NEW.portal_id, 'document');
  v_is_revision := COALESCE(NEW.version_number, 1) > 1;
  v_doc_name := COALESCE(NEW.display_name, NEW.file_name);

  v_kind_label := CASE NEW.doc_kind
    WHEN 'cma' THEN 'comparative market analysis'
    ELSE 'document'
  END;

  IF v_is_revision THEN
    v_title := CASE NEW.doc_kind
      WHEN 'cma' THEN 'Your comparative market analysis has been updated'
      ELSE 'A document has been updated'
    END;
  ELSE
    v_title := 'New document added';
  END IF;

  INSERT INTO public.notifications (user_id, portal_id, type, title, link, client_name, message_preview)
  VALUES (v_client_user_id, NEW.portal_id, 'document', v_title, 'documents',
          'Your agent', v_doc_name);

  IF v_should_email THEN
    IF v_is_revision THEN
      PERFORM public.portal_send_email(
        'portal-document-updated', v_client_email,
        jsonb_build_object(
          'clientName', v_client_name,
          'fileName', v_doc_name,
          'kindLabel', v_kind_label,
          'versionNumber', COALESCE(NEW.version_number, 1)),
        'portal-doc-' || NEW.id::text);
    ELSE
      PERFORM public.portal_send_email(
        'portal-new-documents', v_client_email,
        jsonb_build_object('clientName', v_client_name, 'fileName', NEW.file_name),
        'portal-doc-' || NEW.id::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
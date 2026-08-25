-- 1. Generalise the notification record ------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS link text;

-- 2. Shared email helper ----------------------------------------------------
-- Fire-and-forget call into send-transactional-email. Never raises: a mail
-- problem must not roll back the upload / task that triggered it.
CREATE OR REPLACE FUNCTION public.portal_send_email(
  _template text,
  _recipient text,
  _data jsonb,
  _idempotency_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_key text;
BEGIN
  IF _recipient IS NULL OR _recipient = '' THEN RETURN; END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';
  IF v_key IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url := 'https://sxpfxmlxegpmfamlmjyg.supabase.co/functions/v1/send-transactional-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'templateName', _template,
      'recipientEmail', _recipient,
      'idempotencyKey', _idempotency_key,
      'templateData', COALESCE(_data, '{}'::jsonb)
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'portal_send_email failed (%): %', _template, SQLERRM;
END;
$$;

-- True when no notification of this type for this portal was created in the
-- last 10 minutes (grouping window so batch uploads send one email).
CREATE OR REPLACE FUNCTION public.portal_should_email(_portal_id uuid, _type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE portal_id = _portal_id
      AND type = _type
      AND created_at > now() - interval '10 minutes'
  )
$$;

-- 3. New document -> notify + email the client ------------------------------
CREATE OR REPLACE FUNCTION public.notify_client_of_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_user_id uuid;
  v_client_email text;
  v_client_name text;
  v_should_email boolean;
BEGIN
  SELECT user_id, email, full_name
    INTO v_client_user_id, v_client_email, v_client_name
  FROM public.client_accounts WHERE id = NEW.portal_id;

  IF v_client_user_id IS NULL OR v_client_user_id = NEW.uploaded_by THEN
    RETURN NEW;
  END IF;

  v_should_email := public.portal_should_email(NEW.portal_id, 'document');

  INSERT INTO public.notifications (user_id, portal_id, type, title, link, client_name, message_preview)
  VALUES (v_client_user_id, NEW.portal_id, 'document', 'New document added', 'documents',
          'Your agent', NEW.file_name);

  IF v_should_email THEN
    PERFORM public.portal_send_email(
      'portal-new-documents', v_client_email,
      jsonb_build_object('clientName', v_client_name, 'fileName', NEW.file_name),
      'portal-doc-' || NEW.id::text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_documents_notify_client ON public.portal_documents;
CREATE TRIGGER portal_documents_notify_client
AFTER INSERT ON public.portal_documents
FOR EACH ROW EXECUTE FUNCTION public.notify_client_of_document();

-- 4. New photo -> notify + email the client ---------------------------------
CREATE OR REPLACE FUNCTION public.notify_client_of_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_user_id uuid;
  v_client_email text;
  v_client_name text;
  v_label text;
  v_should_email boolean;
BEGIN
  SELECT user_id, email, full_name
    INTO v_client_user_id, v_client_email, v_client_name
  FROM public.client_accounts WHERE id = NEW.portal_id;

  IF v_client_user_id IS NULL OR v_client_user_id = NEW.uploaded_by THEN
    RETURN NEW;
  END IF;

  v_label := CASE WHEN NEW.category::text = 'milestone' THEN 'Milestone photo' ELSE 'Property photo' END;
  v_should_email := public.portal_should_email(NEW.portal_id, 'photo');

  INSERT INTO public.notifications (user_id, portal_id, type, title, link, client_name, message_preview)
  VALUES (v_client_user_id, NEW.portal_id, 'photo', v_label || ' added', 'photos',
          'Your agent', COALESCE(NEW.caption, v_label));

  IF v_should_email THEN
    PERFORM public.portal_send_email(
      'portal-new-photos', v_client_email,
      jsonb_build_object('clientName', v_client_name, 'category', v_label),
      'portal-photo-' || NEW.id::text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_photos_notify_client ON public.portal_photos;
CREATE TRIGGER portal_photos_notify_client
AFTER INSERT ON public.portal_photos
FOR EACH ROW EXECUTE FUNCTION public.notify_client_of_photo();

-- 5. New task -> notify + email the client ----------------------------------
CREATE OR REPLACE FUNCTION public.notify_client_of_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_user_id uuid;
  v_client_email text;
  v_client_name text;
BEGIN
  SELECT user_id, email, full_name
    INTO v_client_user_id, v_client_email, v_client_name
  FROM public.client_accounts WHERE id = NEW.client_account_id;

  IF v_client_user_id IS NULL OR v_client_user_id = NEW.assigned_by THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, portal_id, type, title, link, client_name, message_preview)
  VALUES (v_client_user_id, NEW.client_account_id, 'task', 'New task assigned', 'tasks',
          'Your agent', NEW.title);

  PERFORM public.portal_send_email(
    'portal-new-task', v_client_email,
    jsonb_build_object('clientName', v_client_name, 'taskTitle', NEW.title,
                       'taskDescription', NEW.description, 'dueDate', NEW.due_date),
    'portal-task-' || NEW.id::text);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_tasks_notify_client ON public.client_tasks;
CREATE TRIGGER client_tasks_notify_client
AFTER INSERT ON public.client_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_client_of_task();

-- 6. Messages: keep both directions, tag the type, email the client ---------
CREATE OR REPLACE FUNCTION public.notify_agent_of_client_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_id UUID;
  v_client_user_id UUID;
  v_client_name TEXT;
  v_client_email TEXT;
  v_sender_display TEXT;
  v_should_email BOOLEAN;
BEGIN
  SELECT invited_by, user_id, COALESCE(full_name, email), email
    INTO v_agent_id, v_client_user_id, v_client_name, v_client_email
  FROM public.client_accounts
  WHERE id = NEW.portal_id;

  IF NEW.sender_type = 'client' THEN
    IF v_agent_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, portal_id, message_id, type, title, link, client_name, message_preview)
      VALUES (v_agent_id, NEW.portal_id, NEW.id, 'message', 'New client message', 'messages',
              v_client_name, LEFT(COALESCE(NEW.message_body, ''), 100));
    END IF;
  ELSE
    IF v_client_user_id IS NOT NULL
       AND (NEW.sender_user_id IS NULL OR NEW.sender_user_id <> v_client_user_id) THEN
      v_sender_display := COALESCE(NEW.sender_name, 'Your agent');
      v_should_email := public.portal_should_email(NEW.portal_id, 'message');

      INSERT INTO public.notifications (user_id, portal_id, message_id, type, title, link, client_name, message_preview)
      VALUES (v_client_user_id, NEW.portal_id, NEW.id, 'message', 'New message', 'messages',
              v_sender_display, LEFT(COALESCE(NEW.message_body, ''), 100));

      IF v_should_email THEN
        PERFORM public.portal_send_email(
          'portal-new-message', v_client_email,
          jsonb_build_object('clientName', v_client_name, 'senderName', v_sender_display,
                             'messagePreview', LEFT(COALESCE(NEW.message_body, ''), 200)),
          'portal-msg-' || NEW.id::text);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.notify_agent_of_client_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id UUID;
  v_creator_id UUID;
  v_client_user_id UUID;
  v_client_name TEXT;
  v_client_email TEXT;
  v_sender_display TEXT;
  v_should_email BOOLEAN;
BEGIN
  SELECT COALESCE(assigned_agent_id, invited_by), invited_by, user_id,
         COALESCE(full_name, email), email
    INTO v_agent_id, v_creator_id, v_client_user_id, v_client_name, v_client_email
  FROM public.client_accounts
  WHERE id = NEW.portal_id;

  IF NEW.sender_type = 'client' THEN
    -- The assigned agent is notified first; the portal's creator also gets one
    -- when they are a different person.
    IF v_agent_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, portal_id, message_id, type, title, link, client_name, message_preview)
      VALUES (v_agent_id, NEW.portal_id, NEW.id, 'message', 'New client message', 'messages',
              v_client_name, LEFT(COALESCE(NEW.message_body, ''), 100));
    END IF;
    IF v_creator_id IS NOT NULL AND v_creator_id IS DISTINCT FROM v_agent_id THEN
      INSERT INTO public.notifications (user_id, portal_id, message_id, type, title, link, client_name, message_preview)
      VALUES (v_creator_id, NEW.portal_id, NEW.id, 'message', 'New client message', 'messages',
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
$function$;
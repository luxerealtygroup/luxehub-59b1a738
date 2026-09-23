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
  v_org_id UUID;
  v_sender_display TEXT;
  v_should_email BOOLEAN;
  v_title TEXT;
BEGIN
  SELECT COALESCE(assigned_agent_id, invited_by), invited_by, user_id,
         COALESCE(full_name, email), email, org_id
    INTO v_agent_id, v_creator_id, v_client_user_id, v_client_name, v_client_email, v_org_id
  FROM public.client_accounts
  WHERE id = NEW.portal_id;

  v_sender_display := COALESCE(NEW.sender_name, CASE WHEN NEW.sender_type = 'client' THEN v_client_name ELSE 'Your agent' END);
  v_title := CASE
    WHEN NEW.is_internal THEN 'Internal note'
    WHEN NEW.sender_type = 'client' THEN 'New client message'
    ELSE 'New message'
  END;

  -- Team side of the thread: the assigned agent, the portal's creator and
  -- every operations/admin/owner user in the same organisation. The sender is
  -- never notified about their own message. Internal notes stop here.
  INSERT INTO public.notifications (user_id, portal_id, message_id, type, title, link, client_name, message_preview)
  SELECT DISTINCT p.id, NEW.portal_id, NEW.id, 'message', v_title, 'messages',
         v_client_name, LEFT(COALESCE(NEW.message_body, ''), 100)
  FROM public.profiles p
  WHERE p.org_id = v_org_id
    AND p.id IS DISTINCT FROM NEW.sender_user_id
    AND (
      p.id = v_agent_id
      OR p.id = v_creator_id
      OR public.has_role(p.id, 'operations')
      OR public.has_role(p.id, 'admin')
      OR public.has_role(p.id, 'owner')
    );

  -- Client side: only for team messages the client is allowed to see.
  IF NEW.sender_type <> 'client' AND NEW.is_internal IS NOT TRUE THEN
    IF v_client_user_id IS NOT NULL
       AND (NEW.sender_user_id IS NULL OR NEW.sender_user_id <> v_client_user_id) THEN
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
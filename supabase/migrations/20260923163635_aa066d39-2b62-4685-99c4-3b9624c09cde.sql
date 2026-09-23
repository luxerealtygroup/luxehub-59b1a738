ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS include_in_all_conversations boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_portal_participants(_portal_id uuid)
 RETURNS TABLE(user_id uuid, full_name text, avatar_url text, role_label text, is_client boolean, sort_order integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id UUID; v_client_user_id UUID; v_client_name TEXT; v_org_id UUID;
BEGIN
  IF NOT (public.can_access_portal(_portal_id, auth.uid()) OR public.owns_portal(_portal_id, auth.uid())) THEN
    RETURN;
  END IF;

  SELECT COALESCE(ca.assigned_agent_id, ca.invited_by), ca.user_id, COALESCE(ca.full_name, ca.email), ca.org_id
    INTO v_agent_id, v_client_user_id, v_client_name, v_org_id
  FROM public.client_accounts ca WHERE ca.id = _portal_id;

  -- Participants: the assigned agent, anyone flagged "include in all client
  -- conversations", and an owner/admin only once they have posted here.
  RETURN QUERY
  SELECT p.id,
         COALESCE(p.full_name, p.email, 'Team member'),
         p.avatar_url,
         COALESCE(p.display_title,
           CASE
             WHEN p.id = v_agent_id THEN 'Your Agent'
             WHEN p.include_in_all_conversations THEN 'Client Care'
             WHEN public.has_role(p.id, 'owner') THEN 'Broker of Record'
             ELSE 'Agent'
           END),
         FALSE,
         CASE WHEN p.id = v_agent_id THEN 0 WHEN p.include_in_all_conversations THEN 1 ELSE 2 END
  FROM public.profiles p
  WHERE p.org_id = v_org_id
    AND (
      p.id = v_agent_id
      OR p.include_in_all_conversations
      OR (public.is_admin_or_owner(p.id) AND EXISTS (
            SELECT 1 FROM public.portal_messages m
            WHERE m.portal_id = _portal_id AND m.sender_user_id = p.id))
    );

  RETURN QUERY
  SELECT v_client_user_id, v_client_name, NULL::text, 'Client'::text, TRUE, 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_agent_of_client_message()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_id UUID; v_client_user_id UUID; v_client_name TEXT; v_client_email TEXT; v_org_id UUID;
  v_sender_display TEXT; v_should_email BOOLEAN; v_title TEXT;
BEGIN
  SELECT COALESCE(assigned_agent_id, invited_by), user_id, COALESCE(full_name, email), email, org_id
    INTO v_agent_id, v_client_user_id, v_client_name, v_client_email, v_org_id
  FROM public.client_accounts WHERE id = NEW.portal_id;

  v_sender_display := COALESCE(NEW.sender_name, CASE WHEN NEW.sender_type = 'client' THEN v_client_name ELSE 'Your agent' END);
  v_title := CASE
    WHEN NEW.is_internal THEN 'Internal note'
    WHEN NEW.sender_type = 'client' THEN 'New client message'
    ELSE 'New message' END;

  -- Team: assigned agent + "all conversations" people. For team messages
  -- (including internal notes) also an owner/admin who has posted in this thread.
  INSERT INTO public.notifications (user_id, portal_id, message_id, type, title, link, client_name, message_preview)
  SELECT DISTINCT p.id, NEW.portal_id, NEW.id, 'message', v_title, 'messages',
         v_client_name, LEFT(COALESCE(NEW.message_body, ''), 100)
  FROM public.profiles p
  WHERE p.org_id = v_org_id
    AND p.id IS DISTINCT FROM NEW.sender_user_id
    AND (
      p.id = v_agent_id
      OR p.include_in_all_conversations
      OR (NEW.sender_type <> 'client' AND public.is_admin_or_owner(p.id) AND EXISTS (
            SELECT 1 FROM public.portal_messages m
            WHERE m.portal_id = NEW.portal_id AND m.sender_user_id = p.id AND m.id <> NEW.id))
    );

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
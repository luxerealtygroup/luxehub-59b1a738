
CREATE OR REPLACE FUNCTION public.notify_agent_of_client_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
  v_client_user_id UUID;
  v_client_name TEXT;
  v_sender_display TEXT;
BEGIN
  SELECT invited_by, user_id, COALESCE(full_name, email)
    INTO v_agent_id, v_client_user_id, v_client_name
  FROM public.client_accounts
  WHERE id = NEW.portal_id;

  IF NEW.sender_type = 'client' THEN
    -- Notify the assigned agent
    IF v_agent_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, portal_id, message_id, client_name, message_preview)
      VALUES (
        v_agent_id,
        NEW.portal_id,
        NEW.id,
        v_client_name,
        LEFT(COALESCE(NEW.message_body, ''), 100)
      );
    END IF;
  ELSE
    -- Agent or ops message → notify the client
    -- Skip if the client themselves is the sender (defensive; client should be sender_type='client')
    IF v_client_user_id IS NOT NULL
       AND (NEW.sender_user_id IS NULL OR NEW.sender_user_id <> v_client_user_id) THEN
      v_sender_display := COALESCE(NEW.sender_name, 'Your agent');
      INSERT INTO public.notifications (user_id, portal_id, message_id, client_name, message_preview)
      VALUES (
        v_client_user_id,
        NEW.portal_id,
        NEW.id,
        v_sender_display,
        LEFT(COALESCE(NEW.message_body, ''), 100)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

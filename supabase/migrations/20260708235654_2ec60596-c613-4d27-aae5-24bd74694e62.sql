
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  portal_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.portal_messages(id) ON DELETE CASCADE,
  client_name TEXT,
  message_preview TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx
  ON public.notifications (user_id) WHERE is_read = false;

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their notifications; admins read all"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  );

CREATE POLICY "Users mark their notifications; admins mark any"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  );

CREATE POLICY "Users delete their notifications; admins delete any"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  );

-- Trigger: when a client sends a portal_message, create a notification for the assigned agent.
CREATE OR REPLACE FUNCTION public.notify_agent_of_client_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
  v_client_name TEXT;
BEGIN
  IF NEW.sender_type <> 'client' THEN
    RETURN NEW;
  END IF;

  SELECT invited_by, COALESCE(full_name, email)
    INTO v_agent_id, v_client_name
  FROM public.client_accounts
  WHERE id = NEW.portal_id;

  IF v_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, portal_id, message_id, client_name, message_preview)
  VALUES (
    v_agent_id,
    NEW.portal_id,
    NEW.id,
    v_client_name,
    LEFT(COALESCE(NEW.message_body, ''), 100)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER portal_messages_notify_agent
AFTER INSERT ON public.portal_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_agent_of_client_message();

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

REVOKE ALL ON FUNCTION public.portal_send_email(text, text, jsonb, text) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.portal_should_email(uuid, text) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.notify_client_of_document() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.notify_client_of_photo() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.notify_client_of_task() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.notify_agent_of_client_message() FROM anon, authenticated, public;
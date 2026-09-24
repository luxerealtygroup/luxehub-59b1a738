CREATE TABLE public.temp_password_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid,
  portal_id uuid,
  issued_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.temp_password_grants TO service_role;
ALTER TABLE public.temp_password_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view grants in their org" ON public.temp_password_grants
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));
GRANT SELECT ON public.temp_password_grants TO authenticated;
CREATE INDEX temp_password_grants_user_idx ON public.temp_password_grants(user_id) WHERE used_at IS NULL AND expired_at IS NULL;

-- Server-only claim used after a forced password change: links the unclaimed,
-- still-valid portal invited to this user's email. Only the backend may call it.
CREATE OR REPLACE FUNCTION public.claim_portal_for_user(_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.client_accounts%ROWTYPE;
  v_email text;
  v_prev_type text;
  v_prev_roles public.app_role[];
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = _user_id AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Account email is not confirmed'; END IF;

  SELECT * INTO r FROM public.client_accounts WHERE user_id = _user_id LIMIT 1;
  IF FOUND THEN RETURN r.id; END IF;

  SELECT * INTO r FROM public.client_accounts
   WHERE lower(trim(email)) = lower(trim(v_email)) AND user_id IS NULL
     AND invite_token IS NOT NULL AND invite_used_at IS NULL AND invite_expires_at > now()
   ORDER BY invited_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open portal invitation for this email'; END IF;

  SELECT member_type INTO v_prev_type FROM public.profiles WHERE id = _user_id FOR UPDATE;
  SELECT COALESCE(array_agg(role ORDER BY role::text), '{}'::public.app_role[]) INTO v_prev_roles FROM public.user_roles WHERE user_id = _user_id;

  UPDATE public.client_accounts
  SET user_id = _user_id, claimed_at = now(), invite_used_at = now(), invite_token = NULL, invite_expires_at = NULL
  WHERE id = r.id;

  PERFORM set_config('app.allow_member_type_change', 'on', true);
  PERFORM set_config('app.allow_org_move', 'on', true);
  UPDATE public.profiles SET org_id = r.org_id, member_type = 'client', updated_at = now() WHERE id = _user_id;
  PERFORM set_config('app.allow_org_move', 'off', true);
  PERFORM set_config('app.allow_member_type_change', 'off', true);

  DELETE FROM public.user_roles WHERE user_id = _user_id;

  INSERT INTO public.invitation_security_audit (org_id, user_id, portal_id, invitation_type, outcome, expected_member_type, previous_member_type, previous_roles, details)
  VALUES (r.org_id, _user_id, r.id, 'client_portal',
    CASE WHEN v_prev_type IS DISTINCT FROM 'client' OR cardinality(v_prev_roles) > 0 THEN 'role_corrected' ELSE 'claimed' END,
    'client', v_prev_type, v_prev_roles,
    jsonb_build_object('invited_email', lower(trim(r.email)), 'via', 'temporary_password_change'));
  RETURN r.id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.claim_portal_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_portal_for_user(uuid) TO service_role;

-- Hourly: scramble any unused temporary password older than its expiry.
SELECT cron.schedule(
  'temp-password-expiry',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sxpfxmlxegpmfamlmjyg.supabase.co/functions/v1/temp-password?action=expire',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
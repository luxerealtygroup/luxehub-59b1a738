ALTER TABLE public.invitation_security_audit DROP CONSTRAINT IF EXISTS invitation_security_audit_outcome_check;
ALTER TABLE public.invitation_security_audit ADD CONSTRAINT invitation_security_audit_outcome_check
  CHECK (outcome = ANY (ARRAY['claimed','role_corrected','rejected','claim_failed']));

CREATE OR REPLACE FUNCTION public.claim_portal_invite(_token text, _full_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.client_accounts%ROWTYPE;
  v_email text;
  v_previous_member_type text;
  v_previous_roles public.app_role[];
  v_outcome text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in to claim a portal'; END IF;
  SELECT * INTO r FROM public.client_accounts WHERE invite_token = _token FOR UPDATE;
  IF NOT FOUND THEN
    -- Already claimed by this same user (token is cleared on claim): succeed idempotently.
    SELECT * INTO r FROM public.client_accounts WHERE user_id = auth.uid() LIMIT 1;
    IF FOUND THEN RETURN r.id; END IF;
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;
  IF r.user_id IS NOT NULL THEN
    IF r.user_id = auth.uid() THEN RETURN r.id; END IF;
    RAISE EXCEPTION 'This invitation has already been used';
  END IF;
  IF r.invite_used_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation has already been used'; END IF;
  IF r.invite_expires_at IS NULL OR r.invite_expires_at < now() THEN RAISE EXCEPTION 'This invitation has expired'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR r.email IS NULL OR lower(trim(v_email)) <> lower(trim(r.email)) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address. Sign in with the address your agent used, or request a new link.';
  END IF;

  SELECT member_type INTO v_previous_member_type FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  SELECT COALESCE(array_agg(role ORDER BY role::text), '{}'::public.app_role[])
    INTO v_previous_roles FROM public.user_roles WHERE user_id = auth.uid();
  v_outcome := CASE WHEN v_previous_member_type IS DISTINCT FROM 'client' OR cardinality(v_previous_roles) > 0 THEN 'role_corrected' ELSE 'claimed' END;

  UPDATE public.client_accounts
  SET user_id = auth.uid(), full_name = COALESCE(NULLIF(_full_name, ''), full_name),
      claimed_at = now(), invite_used_at = now(), invite_token = NULL, invite_expires_at = NULL
  WHERE id = r.id;

  -- Trusted server path: the invite token + matching email authorise the org move
  -- and the client classification. Both flags are transaction-local.
  PERFORM set_config('app.allow_member_type_change', 'on', true);
  PERFORM set_config('app.allow_org_move', 'on', true);
  UPDATE public.profiles
  SET org_id = r.org_id, member_type = 'client',
      full_name = COALESCE(NULLIF(_full_name, ''), full_name, r.full_name), updated_at = now()
  WHERE id = auth.uid();
  PERFORM set_config('app.allow_org_move', 'off', true);
  PERFORM set_config('app.allow_member_type_change', 'off', true);

  DELETE FROM public.user_roles WHERE user_id = auth.uid();

  INSERT INTO public.invitation_security_audit (
    org_id, user_id, portal_id, invitation_type, outcome,
    expected_member_type, previous_member_type, previous_roles, details
  ) VALUES (
    r.org_id, auth.uid(), r.id, 'client_portal', v_outcome,
    'client', v_previous_member_type, v_previous_roles,
    jsonb_build_object('invited_email', lower(trim(r.email)), 'claimed_by', auth.uid())
  );

  RETURN r.id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.claim_portal_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_portal_invite(text, text) TO authenticated;

-- Records a failed portal claim (the claim itself rolls back) and notifies the assigned agent.
CREATE OR REPLACE FUNCTION public.report_portal_claim_failure(_token text, _error text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.client_accounts%ROWTYPE;
  v_email text;
  v_agent uuid;
BEGIN
  IF auth.uid() IS NULL OR _token IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.client_accounts WHERE invite_token = _token;
  IF NOT FOUND THEN RETURN; END IF;
  -- One alert per portal per hour is enough.
  IF EXISTS (SELECT 1 FROM public.invitation_security_audit
             WHERE portal_id = r.id AND outcome = 'claim_failed' AND created_at > now() - interval '1 hour') THEN
    RETURN;
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.invitation_security_audit (org_id, user_id, portal_id, invitation_type, outcome, expected_member_type, details)
  VALUES (r.org_id, auth.uid(), r.id, 'client_portal', 'claim_failed', 'client',
    jsonb_build_object('invited_email', lower(trim(r.email)), 'signed_in_email', lower(trim(v_email)), 'error', left(coalesce(_error, ''), 500)));
  v_agent := COALESCE(r.assigned_agent_id, r.invited_by);
  IF v_agent IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, org_id, portal_id, type, title, message_preview, client_name, link)
    VALUES (v_agent, r.org_id, r.id, 'portal_claim_failed', 'Client could not connect their portal',
      left(coalesce(r.full_name, r.email) || ' signed in but the portal link failed: ' || coalesce(_error, ''), 280),
      r.full_name, '/dashboard/admin/client-portals');
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.report_portal_claim_failure(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_portal_claim_failure(text, text) TO authenticated;
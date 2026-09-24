CREATE OR REPLACE FUNCTION public.enforce_profile_member_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF current_setting('app.allow_member_type_change', true) IS DISTINCT FROM 'on' THEN
      NEW.member_type := 'client';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.member_type IS DISTINCT FROM OLD.member_type
     AND current_setting('app.allow_member_type_change', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Account classification can only be changed through a verified invitation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_profile_member_type() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_profile_member_type_before_write
BEFORE INSERT OR UPDATE OF member_type ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_member_type();

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
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
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

  PERFORM set_config('app.allow_member_type_change', 'on', true);
  UPDATE public.profiles
  SET org_id = r.org_id, member_type = 'client',
      full_name = COALESCE(NULLIF(_full_name, ''), full_name, r.full_name), updated_at = now()
  WHERE id = auth.uid();
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

CREATE OR REPLACE FUNCTION public.claim_org_invite(_token text, _full_name text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.org_invites%ROWTYPE;
  v_email text;
  v_previous_member_type text;
  v_previous_roles public.app_role[];
  v_expected_member_type text;
  v_outcome text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be signed in to accept an invitation'; END IF;
  SELECT * INTO r FROM public.org_invites WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  IF r.used_at IS NOT NULL OR r.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation has already been used'; END IF;
  IF r.expires_at IS NULL OR r.expires_at < now() THEN RAISE EXCEPTION 'This invitation has expired'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR lower(trim(v_email)) <> lower(trim(r.email)) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address. Sign in with the invited address.';
  END IF;

  SELECT member_type INTO v_previous_member_type FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  SELECT COALESCE(array_agg(role ORDER BY role::text), '{}'::public.app_role[])
    INTO v_previous_roles FROM public.user_roles WHERE user_id = auth.uid();
  v_expected_member_type := CASE WHEN r.role = 'operations' THEN 'operations' ELSE 'agent' END;
  v_outcome := CASE WHEN v_previous_member_type IS DISTINCT FROM v_expected_member_type OR cardinality(v_previous_roles) > 0 THEN 'role_corrected' ELSE 'claimed' END;

  PERFORM set_config('app.allow_org_move', 'on', true);
  PERFORM set_config('app.allow_member_type_change', 'on', true);
  PERFORM set_config('app.claiming_org_invite', 'on', true);

  UPDATE public.profiles
  SET org_id = r.org_id, member_type = v_expected_member_type,
      full_name = COALESCE(NULLIF(_full_name, ''), full_name, r.full_name), updated_at = now()
  WHERE id = auth.uid();
  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), r.role);
  UPDATE public.org_invites SET used_at = now(), token = NULL WHERE id = r.id;

  INSERT INTO public.invitation_security_audit (
    org_id, user_id, org_invite_id, invitation_type, outcome,
    expected_member_type, previous_member_type, previous_roles, details
  ) VALUES (
    r.org_id, auth.uid(), r.id, 'team', v_outcome,
    v_expected_member_type, v_previous_member_type, v_previous_roles,
    jsonb_build_object('invited_email', lower(trim(r.email)), 'assigned_role', r.role::text, 'claimed_by', auth.uid())
  );

  PERFORM set_config('app.claiming_org_invite', 'off', true);
  PERFORM set_config('app.allow_member_type_change', 'off', true);
  PERFORM set_config('app.allow_org_move', 'off', true);
  RETURN r.org_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_portal_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_portal_invite(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_org_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_org_invite(text, text) TO authenticated, service_role;
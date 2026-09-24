CREATE OR REPLACE FUNCTION public.enforce_invited_team_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_member_type text;
BEGIN
  SELECT org_id, member_type
  INTO v_org_id, v_member_type
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF EXISTS (
    SELECT 1 FROM public.client_accounts WHERE user_id = NEW.user_id
  ) OR v_member_type = 'client' THEN
    INSERT INTO public.invitation_security_audit (
      org_id, user_id, invitation_type, outcome, expected_member_type, previous_member_type, details
    ) VALUES (
      v_org_id, NEW.user_id, 'team', 'rejected', 'client', v_member_type,
      jsonb_build_object('reason', 'client_account_team_role_attempt', 'attempted_role', NEW.role::text, 'actor_id', auth.uid())
    );
    RAISE EXCEPTION 'Client accounts cannot be assigned team permissions';
  END IF;

  IF NEW.role = 'agent'
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id)
     AND current_setting('app.claiming_org_invite', true) IS DISTINCT FROM 'on' THEN
    INSERT INTO public.invitation_security_audit (
      org_id, user_id, invitation_type, outcome, expected_member_type, previous_member_type, details
    ) VALUES (
      v_org_id, NEW.user_id, 'team', 'rejected', 'agent', v_member_type,
      jsonb_build_object('reason', 'agent_role_without_team_invite', 'attempted_role', NEW.role::text, 'actor_id', auth.uid())
    );
    RAISE EXCEPTION 'New realtor accounts must accept an administrator-created team invitation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_invited_team_roles() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER enforce_invited_team_roles_before_write
BEFORE INSERT OR UPDATE OF user_id, role ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invited_team_roles();

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to accept an invitation';
  END IF;

  SELECT * INTO r FROM public.org_invites WHERE token = _token FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  IF r.used_at IS NOT NULL OR r.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been used';
  END IF;
  IF r.expires_at IS NULL OR r.expires_at < now() THEN
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR lower(trim(v_email)) <> lower(trim(r.email)) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address. Sign in with the invited address.';
  END IF;

  SELECT member_type INTO v_previous_member_type
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  SELECT COALESCE(array_agg(role ORDER BY role::text), '{}'::public.app_role[])
  INTO v_previous_roles
  FROM public.user_roles
  WHERE user_id = auth.uid();

  v_expected_member_type := CASE WHEN r.role = 'operations' THEN 'operations' ELSE 'agent' END;
  v_outcome := CASE
    WHEN v_previous_member_type IS DISTINCT FROM v_expected_member_type OR cardinality(v_previous_roles) > 0
      THEN 'role_corrected'
    ELSE 'claimed'
  END;

  PERFORM set_config('app.allow_org_move', 'on', true);
  PERFORM set_config('app.claiming_org_invite', 'on', true);

  UPDATE public.profiles
  SET org_id = r.org_id,
      member_type = v_expected_member_type,
      full_name = COALESCE(NULLIF(_full_name, ''), full_name, r.full_name),
      updated_at = now()
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
  PERFORM set_config('app.allow_org_move', 'off', true);

  RETURN r.org_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_portal_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_portal_invite(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_org_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_org_invite(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_portal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_portal(uuid, uuid) TO authenticated, service_role;
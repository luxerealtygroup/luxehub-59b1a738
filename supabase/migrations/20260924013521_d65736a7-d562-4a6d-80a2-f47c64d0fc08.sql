ALTER TABLE public.profiles
  ALTER COLUMN member_type SET DEFAULT 'client';

CREATE TABLE public.invitation_security_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  portal_id uuid REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  org_invite_id uuid REFERENCES public.org_invites(id) ON DELETE SET NULL,
  invitation_type text NOT NULL CHECK (invitation_type IN ('client_portal', 'team')),
  outcome text NOT NULL CHECK (outcome IN ('claimed', 'role_corrected', 'rejected')),
  expected_member_type text NOT NULL,
  previous_member_type text,
  previous_roles public.app_role[] NOT NULL DEFAULT '{}'::public.app_role[],
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invitation_security_audit TO authenticated;
GRANT ALL ON public.invitation_security_audit TO service_role;

ALTER TABLE public.invitation_security_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view invitation security audit"
ON public.invitation_security_audit
FOR SELECT TO authenticated
USING (
  org_id = public.current_user_org_id()
  AND public.is_admin_or_owner(auth.uid())
);

CREATE INDEX idx_invitation_security_audit_org_created
  ON public.invitation_security_audit (org_id, created_at DESC);
CREATE INDEX idx_invitation_security_audit_user
  ON public.invitation_security_audit (user_id, created_at DESC);
CREATE INDEX idx_invitation_security_audit_portal
  ON public.invitation_security_audit (portal_id, created_at DESC);

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to claim a portal';
  END IF;

  SELECT * INTO r FROM public.client_accounts WHERE invite_token = _token FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  IF r.user_id IS NOT NULL THEN
    IF r.user_id = auth.uid() THEN
      RETURN r.id;
    END IF;
    RAISE EXCEPTION 'This invitation has already been used';
  END IF;

  IF r.invite_used_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been used';
  END IF;

  IF r.invite_expires_at IS NULL OR r.invite_expires_at < now() THEN
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR r.email IS NULL OR lower(trim(v_email)) <> lower(trim(r.email)) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address. Sign in with the address your agent used, or request a new link.';
  END IF;

  SELECT member_type INTO v_previous_member_type
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  SELECT COALESCE(array_agg(role ORDER BY role::text), '{}'::public.app_role[])
  INTO v_previous_roles
  FROM public.user_roles
  WHERE user_id = auth.uid();

  v_outcome := CASE
    WHEN v_previous_member_type IS DISTINCT FROM 'client' OR cardinality(v_previous_roles) > 0
      THEN 'role_corrected'
    ELSE 'claimed'
  END;

  UPDATE public.client_accounts
  SET user_id = auth.uid(),
      full_name = COALESCE(NULLIF(_full_name, ''), full_name),
      claimed_at = now(),
      invite_used_at = now(),
      invite_token = NULL,
      invite_expires_at = NULL
  WHERE id = r.id;

  UPDATE public.profiles
  SET org_id = r.org_id,
      member_type = 'client',
      full_name = COALESCE(NULLIF(_full_name, ''), full_name, r.full_name),
      updated_at = now()
  WHERE id = auth.uid();

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

  v_expected_member_type := CASE
    WHEN r.role = 'operations' THEN 'operations'
    ELSE 'agent'
  END;
  v_outcome := CASE
    WHEN v_previous_member_type IS DISTINCT FROM v_expected_member_type
      OR cardinality(v_previous_roles) > 0
      THEN 'role_corrected'
    ELSE 'claimed'
  END;

  PERFORM set_config('app.allow_org_move', 'on', true);

  UPDATE public.profiles
  SET org_id = r.org_id,
      member_type = v_expected_member_type,
      full_name = COALESCE(NULLIF(_full_name, ''), full_name, r.full_name),
      updated_at = now()
  WHERE id = auth.uid();

  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), r.role);

  UPDATE public.org_invites
  SET used_at = now(), token = NULL
  WHERE id = r.id;

  INSERT INTO public.invitation_security_audit (
    org_id, user_id, org_invite_id, invitation_type, outcome,
    expected_member_type, previous_member_type, previous_roles, details
  ) VALUES (
    r.org_id, auth.uid(), r.id, 'team', v_outcome,
    v_expected_member_type, v_previous_member_type, v_previous_roles,
    jsonb_build_object('invited_email', lower(trim(r.email)), 'assigned_role', r.role::text, 'claimed_by', auth.uid())
  );

  PERFORM set_config('app.allow_org_move', 'off', true);

  RETURN r.org_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_portal(_portal_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_accounts ca
    JOIN public.profiles p ON p.id = _user_id
    WHERE ca.id = _portal_id
      AND ca.org_id IS NOT NULL
      AND ca.org_id = p.org_id
      AND (
        ca.user_id = _user_id
        OR ca.invited_by = _user_id
        OR ca.assigned_agent_id = _user_id
        OR public.is_admin_or_owner(_user_id)
      )
  );
$function$;
-- Invite tokens are no longer sufficient on their own: the claiming account's
-- email must match the address the invite was issued to (case-insensitive).
CREATE OR REPLACE FUNCTION public.claim_portal_invite(_token text, _full_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.client_accounts%ROWTYPE;
  v_email text;
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

  UPDATE public.client_accounts
  SET user_id = auth.uid(),
      full_name = COALESCE(NULLIF(_full_name, ''), full_name),
      claimed_at = now(),
      invite_used_at = now(),
      invite_token = NULL,
      invite_expires_at = NULL
  WHERE id = r.id;

  UPDATE public.profiles
  SET org_id = COALESCE(org_id, r.org_id)
  WHERE id = auth.uid();

  RETURN r.id;
END;
$$;

-- Invitations now last 30 days instead of 7.
CREATE OR REPLACE FUNCTION public.create_portal_invite(_portal_id uuid)
RETURNS TABLE(token text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_token text;
  v_expires timestamptz;
BEGIN
  SELECT invited_by INTO v_owner FROM public.client_accounts WHERE id = _portal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portal not found';
  END IF;

  IF NOT (public.is_admin_or_owner(auth.uid()) OR v_owner = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to invite for this portal';
  END IF;

  v_token := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
  v_expires := now() + interval '30 days';

  UPDATE public.client_accounts
  SET invite_token = v_token,
      invite_expires_at = v_expires,
      invite_used_at = NULL,
      invited_at = now()
  WHERE id = _portal_id;

  RETURN QUERY SELECT v_token, v_expires;
END;
$$;
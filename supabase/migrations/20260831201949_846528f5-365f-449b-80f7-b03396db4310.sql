ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_used_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS client_accounts_invite_token_key
  ON public.client_accounts (invite_token)
  WHERE invite_token IS NOT NULL;

-- Backfill: portals that already have a signed-in client count as claimed
UPDATE public.client_accounts
SET claimed_at = COALESCE(updated_at, created_at)
WHERE user_id IS NOT NULL AND claimed_at IS NULL;

-- Backfill: portals that actually received an invite email
UPDATE public.client_accounts ca
SET invited_at = l.sent_at
FROM (
  SELECT lower(recipient_email) AS email, max(created_at) AS sent_at
  FROM public.email_send_log
  WHERE template_name = 'client-portal-invite' AND status = 'sent'
  GROUP BY 1
) l
WHERE lower(ca.email) = l.email AND ca.invited_at IS NULL;

-- Generate a fresh single-use invite token (agents for their own portals, admins for any)
CREATE OR REPLACE FUNCTION public.create_portal_invite(_portal_id uuid)
RETURNS TABLE(token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_expires := now() + interval '7 days';

  UPDATE public.client_accounts
  SET invite_token = v_token,
      invite_expires_at = v_expires,
      invite_used_at = NULL,
      invited_at = now()
  WHERE id = _portal_id;

  RETURN QUERY SELECT v_token, v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.create_portal_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_portal_invite(uuid) TO authenticated;

-- Check an invite token before/at signup (callable while signed out)
CREATE OR REPLACE FUNCTION public.validate_portal_invite(_token text)
RETURNS TABLE(status text, portal_id uuid, email text, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.client_accounts%ROWTYPE;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO r FROM public.client_accounts WHERE invite_token = _token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text;
  ELSIF r.invite_used_at IS NOT NULL OR r.user_id IS NOT NULL THEN
    RETURN QUERY SELECT 'used'::text, r.id, r.email, r.full_name;
  ELSIF r.invite_expires_at IS NULL OR r.invite_expires_at < now() THEN
    RETURN QUERY SELECT 'expired'::text, r.id, r.email, r.full_name;
  ELSE
    RETURN QUERY SELECT 'valid'::text, r.id, r.email, r.full_name;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_portal_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_portal_invite(text) TO anon, authenticated;

-- Claim a portal with a valid token (signed-in client only)
CREATE OR REPLACE FUNCTION public.claim_portal_invite(_token text, _full_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.client_accounts%ROWTYPE;
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

  UPDATE public.client_accounts
  SET user_id = auth.uid(),
      full_name = COALESCE(NULLIF(_full_name, ''), full_name),
      claimed_at = now(),
      invite_used_at = now(),
      invite_token = NULL,
      invite_expires_at = NULL
  WHERE id = r.id;

  RETURN r.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_portal_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_portal_invite(text, text) TO authenticated;
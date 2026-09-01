-- Who may create/manage other tenants: an admin/owner of the original org.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin_or_owner(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       JOIN public.organizations o ON o.id = p.org_id
       WHERE p.id = _user_id AND o.is_original_org
     )
$$;

DROP POLICY IF EXISTS "Team members can view organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can insert organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update organizations" ON public.organizations;

CREATE POLICY "Members can view their own organization"
ON public.organizations FOR SELECT TO authenticated
USING (id = public.current_user_org_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can create organizations"
ON public.organizations FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can update their own organization"
ON public.organizations FOR UPDATE TO authenticated
USING ((id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()))
       OR public.is_super_admin(auth.uid()))
WITH CHECK ((id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()))
       OR public.is_super_admin(auth.uid()));

-- Provision a new tenant in one call.
CREATE OR REPLACE FUNCTION public.provision_organization(
  _name text,
  _slug text,
  _app_name text DEFAULT NULL,
  _short_name text DEFAULT NULL,
  _brokerage_name text DEFAULT NULL,
  _support_email text DEFAULT NULL,
  _website_domain text DEFAULT NULL,
  _primary_color text DEFAULT NULL,
  _text_color text DEFAULT NULL,
  _logo_url text DEFAULT NULL,
  _mark_url text DEFAULT NULL,
  _seat_limit integer DEFAULT NULL,
  _tier text DEFAULT 'pro'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_slug text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to create an organization';
  END IF;

  v_slug := lower(regexp_replace(trim(coalesce(_slug, '')), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN RAISE EXCEPTION 'A web address slug is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE lower(slug) = v_slug) THEN
    RAISE EXCEPTION 'That web address is already taken';
  END IF;
  IF coalesce(trim(_name), '') = '' THEN RAISE EXCEPTION 'A name is required'; END IF;

  INSERT INTO public.organizations (
    name, slug, app_name, short_name, brokerage_name, support_email, website_domain,
    branding_primary_color, branding_text_color, branding_logo_url, branding_mark_url,
    seat_limit, tier, is_original_org
  ) VALUES (
    trim(_name), v_slug,
    NULLIF(trim(coalesce(_app_name, '')), ''),
    NULLIF(trim(coalesce(_short_name, '')), ''),
    NULLIF(trim(coalesce(_brokerage_name, '')), ''),
    NULLIF(lower(trim(coalesce(_support_email, ''))), ''),
    NULLIF(lower(trim(coalesce(_website_domain, ''))), ''),
    NULLIF(trim(coalesce(_primary_color, '')), ''),
    NULLIF(trim(coalesce(_text_color, '')), ''),
    NULLIF(trim(coalesce(_logo_url, '')), ''),
    NULLIF(trim(coalesce(_mark_url, '')), ''),
    _seat_limit, coalesce(NULLIF(trim(coalesce(_tier,'')),''), 'pro'), false
  ) RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.provision_organization(text,text,text,text,text,text,text,text,text,text,text,integer,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provision_organization(text,text,text,text,text,text,text,text,text,text,text,integer,text) TO authenticated;

-- Invite an owner into another org (super admin only), reusing org_invites.
CREATE OR REPLACE FUNCTION public.create_org_owner_invite(_org_id uuid, _email text, _full_name text DEFAULT NULL)
RETURNS TABLE(token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_token text; v_expires timestamptz;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org_id) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  v_token := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
  v_expires := now() + interval '14 days';

  INSERT INTO public.org_invites (org_id, email, role, full_name, token, expires_at, invited_by)
  VALUES (_org_id, lower(trim(_email)), 'owner', _full_name, v_token, v_expires, auth.uid());

  RETURN QUERY SELECT v_token, v_expires;
END
$$;

REVOKE ALL ON FUNCTION public.create_org_owner_invite(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_org_owner_invite(uuid,text,text) TO authenticated;

-- Super admins can review invites they issued for other orgs.
DROP POLICY IF EXISTS "Super admins can view all invites" ON public.org_invites;
CREATE POLICY "Super admins can view all invites"
ON public.org_invites FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));
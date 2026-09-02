
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id AND org_id IS NULL);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND org_id IS NOT DISTINCT FROM public.current_user_org_id());

CREATE OR REPLACE FUNCTION public.guard_profile_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR auth.uid() IS NULL
     OR coalesce(current_setting('app.allow_org_move', true), '') = 'on'
     OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.org_id IS NOT NULL AND NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'org_id may not be self-assigned';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    IF public.is_admin_or_owner(auth.uid())
       AND NEW.org_id = public.current_user_org_id()
       AND NEW.id <> auth.uid() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'org_id may only be changed by invite acceptance or a trusted server process';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_org_id_trg ON public.profiles;
CREATE TRIGGER guard_profile_org_id_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_org_id();

CREATE OR REPLACE FUNCTION public.claim_org_invite(_token text, _full_name text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r public.org_invites%ROWTYPE;
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

  PERFORM set_config('app.allow_org_move', 'on', true);

  UPDATE public.profiles
  SET org_id = r.org_id,
      full_name = COALESCE(NULLIF(_full_name, ''), full_name, r.full_name)
  WHERE id = auth.uid();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), r.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.org_invites
  SET used_at = now(), token = NULL
  WHERE id = r.id;

  PERFORM set_config('app.allow_org_move', 'off', true);

  RETURN r.org_id;
END
$function$;

DROP POLICY IF EXISTS "Team members view source categories in their org" ON public.deal_source_categories;
CREATE POLICY "Team members view source categories in their org"
ON public.deal_source_categories FOR SELECT TO authenticated
USING (org_id IS NOT NULL AND org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Team members view source targets in their org" ON public.deal_source_targets;
CREATE POLICY "Team members view source targets in their org"
ON public.deal_source_targets FOR SELECT TO authenticated
USING (org_id IS NOT NULL AND org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Team members view modules in their org" ON public.launchpad_modules;
CREATE POLICY "Team members view modules in their org"
ON public.launchpad_modules FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()) AND org_id IS NOT NULL AND org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Team members view slides in their org" ON public.launchpad_slides;
CREATE POLICY "Team members view slides in their org"
ON public.launchpad_slides FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid()) AND org_id IS NOT NULL AND org_id = public.current_user_org_id());

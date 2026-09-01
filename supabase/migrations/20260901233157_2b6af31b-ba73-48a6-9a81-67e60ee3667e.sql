-- =====================================================================
-- 0. SNAPSHOT (restore point)
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS backup_pre_multitenant_20260901;
REVOKE ALL ON SCHEMA backup_pre_multitenant_20260901 FROM PUBLIC;

DO $snap$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS backup_pre_multitenant_20260901.%I AS TABLE public.%I',
      t.tablename, t.tablename);
  END LOOP;
END
$snap$;

-- =====================================================================
-- 1. ORGANIZATIONS: slug + runtime branding
-- =====================================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS app_name text,
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS brokerage_name text,
  ADD COLUMN IF NOT EXISTS brokerage_legal_name text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS website_domain text,
  ADD COLUMN IF NOT EXISTS seat_limit integer;

UPDATE public.organizations
SET slug = COALESCE(
  slug,
  regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')
)
WHERE slug IS NULL;

UPDATE public.organizations o
SET slug = o.slug || '-' || left(replace(o.id::text, '-', ''), 6)
WHERE EXISTS (
  SELECT 1 FROM public.organizations x WHERE x.slug = o.slug AND x.id <> o.id
);

ALTER TABLE public.organizations ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_key ON public.organizations (lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS organizations_website_domain_key
  ON public.organizations (lower(website_domain)) WHERE website_domain IS NOT NULL;

-- =====================================================================
-- 2. ORG TAGGING TRIGGER FUNCTION
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_org_id_from_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  j jsonb := to_jsonb(NEW);
  v uuid;
  ref uuid;
BEGIN
  IF (j ->> 'org_id') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v := public.current_user_org_id();

  IF v IS NULL THEN
    FOREACH ref IN ARRAY ARRAY[
      NULLIF(j ->> 'user_id','')::uuid,
      NULLIF(j ->> 'agent_id','')::uuid,
      NULLIF(j ->> 'created_by','')::uuid,
      NULLIF(j ->> 'uploaded_by','')::uuid,
      NULLIF(j ->> 'invited_by','')::uuid,
      NULLIF(j ->> 'assigned_by','')::uuid
    ] LOOP
      IF ref IS NOT NULL AND v IS NULL THEN
        SELECT p.org_id INTO v FROM public.profiles p WHERE p.id = ref;
      END IF;
    END LOOP;
  END IF;

  IF v IS NULL THEN
    ref := COALESCE(NULLIF(j ->> 'portal_id','')::uuid, NULLIF(j ->> 'client_account_id','')::uuid);
    IF ref IS NOT NULL THEN
      SELECT ca.org_id INTO v FROM public.client_accounts ca WHERE ca.id = ref;
    END IF;
  END IF;

  IF v IS NULL THEN
    SELECT o.id INTO v FROM public.organizations o WHERE o.is_original_org LIMIT 1;
  END IF;

  NEW.org_id := v;
  RETURN NEW;
END
$fn$;

-- =====================================================================
-- 3. ADD org_id + BACKFILL + TRIGGERS + ORG-SCOPED RLS
-- =====================================================================
DO $mt$
DECLARE
  tenant_tables text[] := ARRAY[
    'deals','deal_participants','deal_metadata','deal_sources',
    'pipeline_clients','pipeline_gap_settings',
    'client_accounts','client_transactions','client_documents','client_messages','client_tasks',
    'portal_properties','portal_documents','portal_messages','portal_photos','portal_transactions',
    'portal_contacts','portal_key_dates','portal_condition_notes','portal_timeline_notes',
    'portal_transaction_conditions','portal_fub_deals',
    'commissions','transaction_milestones','coaching_sessions',
    'agent_goals','agent_activities','agent_documents','agent_claude_profiles',
    'sales_activities','sales_metrics','manual_production','production_goals',
    'company_goals','company_budget_expenses','business_planning_reflections',
    'planning_assumptions','planning_reflections','weekly_411','notifications',
    'open_houses','open_house_attendees','appointment_records',
    'cma_reports','cma_import_logs','support_tickets','support_messages',
    'submissions','ac_nominations'
  ];
  skip_policies text[] := ARRAY['ac_nominations|Anyone can submit AC nominations'];
  t text;
  orig uuid;
  pol record;
  new_using text;
  new_check text;
  org_pred constant text := '(org_id = public.current_user_org_id())';
BEGIN
  SELECT id INTO orig FROM public.organizations WHERE is_original_org LIMIT 1;
  IF orig IS NULL THEN
    RAISE EXCEPTION 'No original organization found';
  END IF;

  FOREACH t IN ARRAY tenant_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      RAISE NOTICE 'skipping missing table %', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id)', t);
    EXECUTE format('UPDATE public.%I SET org_id = %L WHERE org_id IS NULL', t, orig);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)', t || '_org_id_idx', t);

    EXECUTE format('DROP TRIGGER IF EXISTS set_org_id_on_insert ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_org_id_on_insert BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_context()', t);

    FOR pol IN
      SELECT policyname, cmd, permissive, roles, qual, with_check
      FROM pg_policies WHERE schemaname='public' AND tablename = t
    LOOP
      IF (t || '|' || pol.policyname) = ANY (skip_policies) THEN
        CONTINUE;
      END IF;

      new_using := CASE WHEN pol.qual IS NULL THEN NULL
                        ELSE '(' || pol.qual || ') AND ' || org_pred END;
      new_check := CASE WHEN pol.with_check IS NULL THEN NULL
                        ELSE '(' || pol.with_check || ') AND ' || org_pred END;

      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
        pol.policyname, t,
        CASE WHEN pol.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        pol.cmd,
        array_to_string(pol.roles, ', '),
        CASE WHEN new_using IS NULL THEN '' ELSE 'USING (' || new_using || ')' END,
        CASE WHEN new_check IS NULL THEN '' ELSE 'WITH CHECK (' || new_check || ')' END
      );
    END LOOP;
  END LOOP;
END
$mt$;

-- =====================================================================
-- 4. CLIENT PROFILES INHERIT THEIR PORTAL'S ORG
-- =====================================================================
UPDATE public.profiles p
SET org_id = ca.org_id
FROM public.client_accounts ca
WHERE ca.user_id = p.id AND p.org_id IS NULL AND ca.org_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_portal_invite(_token text, _full_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  UPDATE public.profiles
  SET org_id = COALESCE(org_id, r.org_id)
  WHERE id = auth.uid();

  RETURN r.id;
END;
$function$;

-- =====================================================================
-- 5. PER-ORG INTEGRATION SECRETS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.org_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  vault_secret_name text NOT NULL,
  last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (org_id, key)
);

GRANT SELECT ON public.org_integrations TO authenticated;
GRANT ALL ON public.org_integrations TO service_role;
ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins can view their integrations" ON public.org_integrations;
CREATE POLICY "Org admins can view their integrations"
ON public.org_integrations FOR SELECT TO authenticated
USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));

DROP TRIGGER IF EXISTS update_org_integrations_updated_at ON public.org_integrations;
CREATE TRIGGER update_org_integrations_updated_at
BEFORE UPDATE ON public.org_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_org_secret(_org_id uuid, _key text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE v_val text;
BEGIN
  IF _org_id IS NULL OR _key NOT IN ('FUB_API_KEY','SLACK_BOT_TOKEN','SLACK_SIGNING_SECRET') THEN
    RETURN NULL;
  END IF;
  SELECT s.decrypted_secret INTO v_val
  FROM public.org_integrations oi
  JOIN vault.decrypted_secrets s ON s.name = oi.vault_secret_name
  WHERE oi.org_id = _org_id AND oi.key = _key;
  RETURN v_val;
END
$fn$;

CREATE OR REPLACE FUNCTION public.set_org_secret(_org_id uuid, _key text, _value text, _actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  IF _key NOT IN ('FUB_API_KEY','SLACK_BOT_TOKEN','SLACK_SIGNING_SECRET') THEN
    RAISE EXCEPTION 'Unknown integration key';
  END IF;
  IF _value IS NULL OR length(trim(_value)) = 0 THEN
    RAISE EXCEPTION 'Empty credential';
  END IF;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Organization required';
  END IF;

  v_name := 'org_' || replace(_org_id::text, '-', '') || '_' || lower(_key);

  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(_value, v_name, 'Per-organization integration credential');
  ELSE
    PERFORM vault.update_secret(v_id, _value, v_name, 'Per-organization integration credential');
  END IF;

  INSERT INTO public.org_integrations (org_id, key, vault_secret_name, last4, updated_at, updated_by)
  VALUES (_org_id, _key, v_name, right(trim(_value), 4), now(), _actor)
  ON CONFLICT (org_id, key) DO UPDATE
    SET vault_secret_name = EXCLUDED.vault_secret_name,
        last4 = EXCLUDED.last4,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;
END
$fn$;

-- =====================================================================
-- 6. PUBLIC HOSTNAME -> ORG BRANDING RESOLUTION (pre-auth safe)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.resolve_org_by_host(_host text)
RETURNS TABLE(id uuid, slug text, name text, app_name text, short_name text,
              brokerage_name text, branding_logo_url text, branding_primary_color text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT o.id, o.slug, o.name, o.app_name, o.short_name,
         o.brokerage_name, o.branding_logo_url, o.branding_primary_color
  FROM public.organizations o
  WHERE _host IS NOT NULL
    AND (
      lower(o.website_domain) = lower(regexp_replace(_host, '^www\.', ''))
      OR lower(o.slug) = lower(split_part(regexp_replace(_host, '^www\.', ''), '.', 1))
    )
  LIMIT 1
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_org_by_host(text) TO anon, authenticated;

-- =====================================================================
-- 7. AGENT SEAT INVITES
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  full_name text,
  token text,
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins can view their invites" ON public.org_invites;
CREATE POLICY "Org admins can view their invites"
ON public.org_invites FOR SELECT TO authenticated
USING (org_id = public.current_user_org_id() AND public.is_admin_or_owner(auth.uid()));

DROP TRIGGER IF EXISTS update_org_invites_updated_at ON public.org_invites;
CREATE TRIGGER update_org_invites_updated_at
BEFORE UPDATE ON public.org_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_org_invite(_email text, _role public.app_role DEFAULT 'agent', _full_name text DEFAULT NULL)
RETURNS TABLE(token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org uuid;
  v_token text;
  v_expires timestamptz;
  v_limit int;
  v_used int;
BEGIN
  v_org := public.current_user_org_id();
  IF v_org IS NULL OR NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to invite team members';
  END IF;
  IF _role NOT IN ('agent','admin','planning_access') THEN
    RAISE EXCEPTION 'Invalid role for a team seat';
  END IF;

  SELECT seat_limit INTO v_limit FROM public.organizations WHERE id = v_org;
  IF v_limit IS NOT NULL THEN
    SELECT (SELECT count(*) FROM public.profiles WHERE org_id = v_org)
         + (SELECT count(*) FROM public.org_invites
            WHERE org_id = v_org AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now())
      INTO v_used;
    IF v_used >= v_limit THEN
      RAISE EXCEPTION 'Seat limit reached for this organization';
    END IF;
  END IF;

  v_token := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
  v_expires := now() + interval '14 days';

  INSERT INTO public.org_invites (org_id, email, role, full_name, token, expires_at, invited_by)
  VALUES (v_org, lower(trim(_email)), _role, _full_name, v_token, v_expires, auth.uid());

  RETURN QUERY SELECT v_token, v_expires;
END
$fn$;

CREATE OR REPLACE FUNCTION public.validate_org_invite(_token text)
RETURNS TABLE(status text, org_id uuid, org_name text, email text, full_name text, role public.app_role)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE r public.org_invites%ROWTYPE;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::public.app_role;
    RETURN;
  END IF;

  SELECT * INTO r FROM public.org_invites WHERE token = _token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::public.app_role;
  ELSIF r.used_at IS NOT NULL OR r.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'used'::text, r.org_id, NULL::text, r.email, r.full_name, r.role;
  ELSIF r.expires_at IS NULL OR r.expires_at < now() THEN
    RETURN QUERY SELECT 'expired'::text, r.org_id, NULL::text, r.email, r.full_name, r.role;
  ELSE
    RETURN QUERY SELECT 'valid'::text, r.org_id, (SELECT name FROM public.organizations WHERE id = r.org_id),
                        r.email, r.full_name, r.role;
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.claim_org_invite(_token text, _full_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  RETURN r.org_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.revoke_org_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.org_invites
  SET revoked_at = now(), token = NULL
  WHERE id = _invite_id AND org_id = public.current_user_org_id();
END
$fn$;

GRANT EXECUTE ON FUNCTION public.create_org_invite(text, public.app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_org_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_org_invite(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_org_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_secret(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_org_secret(uuid, text, text, uuid) TO authenticated, service_role;
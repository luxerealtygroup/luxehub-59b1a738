-- 1. Attendance flag on visitors
ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS attendance text NOT NULL DEFAULT 'during';
ALTER TABLE public.open_house_visitors
  DROP CONSTRAINT IF EXISTS open_house_visitors_attendance_check;
ALTER TABLE public.open_house_visitors
  ADD CONSTRAINT open_house_visitors_attendance_check
  CHECK (attendance = ANY (ARRAY['during'::text,'early'::text,'late'::text]));

-- 2. Sign-in RPC stamps attendance against the real start/end window
CREATE OR REPLACE FUNCTION public.submit_open_house_visitor(_slug text, _first_name text, _last_name text, _email text, _phone text, _working_with_agent boolean, _agent_name text, _intent text, _has_home_to_sell text, _timeline text, _lender_status text, _custom_answers jsonb, _disclosure_accepted boolean, _notes text, _client_captured_at timestamp with time zone)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  oh public.open_houses%ROWTYPE;
  clean_phone text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  at_time timestamptz := coalesce(_client_captured_at, now());
  timing text := 'during';
BEGIN
  SELECT * INTO oh FROM public.open_houses WHERE slug = _slug AND is_active = true LIMIT 1;
  IF oh.id IS NULL THEN
    RAISE EXCEPTION 'This open house is no longer accepting sign-ins.';
  END IF;

  IF coalesce(btrim(_first_name), '') = '' THEN
    RAISE EXCEPTION 'First name is required.';
  END IF;

  IF oh.require_phone AND length(clean_phone) < 10 THEN
    RAISE EXCEPTION 'A valid 10-digit phone number is required.';
  END IF;

  IF coalesce(btrim(_email), '') = '' AND length(clean_phone) < 10 THEN
    RAISE EXCEPTION 'Please provide a phone number or an email address.';
  END IF;

  IF oh.starts_at IS NOT NULL AND at_time < oh.starts_at THEN
    timing := 'early';
  ELSIF oh.ends_at IS NOT NULL AND at_time > oh.ends_at THEN
    timing := 'late';
  END IF;

  INSERT INTO public.open_house_visitors (
    open_house_id, org_id, first_name, last_name, email, phone,
    working_with_agent, agent_name, intent, has_home_to_sell, timeline, lender_status,
    custom_answers, disclosure_accepted, notes, client_captured_at, attendance
  ) VALUES (
    oh.id, oh.org_id, btrim(_first_name), nullif(btrim(coalesce(_last_name, '')), ''),
    nullif(btrim(lower(coalesce(_email, ''))), ''), nullif(clean_phone, ''),
    _working_with_agent, nullif(btrim(coalesce(_agent_name, '')), ''),
    _intent, _has_home_to_sell, _timeline, _lender_status,
    coalesce(_custom_answers, '{}'::jsonb), coalesce(_disclosure_accepted, false),
    nullif(btrim(coalesce(_notes, '')), ''), _client_captured_at, timing
  );
END;
$function$;

-- 3. Seller report counts only people who came through the door
CREATE OR REPLACE FUNCTION public.public_open_house_seller_report(_slug text)
RETURNS TABLE(address text, city text, list_price numeric, cover_photo_url text, starts_at timestamp with time zone, ends_at timestamp with time zone, hosting_agent_name text, hosting_agent_email text, doors_knocked integer, notes text, competing_listings jsonb, visitors integer, with_agent integer, home_to_sell integer, spoken_to_lender integer, hot integer, warm integer, cold integer, price_feedback jsonb, condition_feedback jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    oh.property_address,
    oh.city,
    oh.list_price,
    oh.cover_photo_url,
    oh.starts_at,
    oh.ends_at,
    COALESCE(p.full_name, oh.listing_agent_name),
    COALESCE(p.email, oh.listing_agent_email),
    oh.prep_doors_knocked,
    oh.seller_notes,
    COALESCE(oh.competing_listings, '[]'::jsonb),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.attendance = 'during'),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.attendance = 'during' AND v.working_with_agent IS TRUE),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.attendance = 'during' AND v.has_home_to_sell = 'yes'),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.attendance = 'during' AND v.lender_status IN ('pre_approved','pre_qualified')),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.attendance = 'during' AND v.temperature = 'hot'),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.attendance = 'during' AND v.temperature = 'warm'),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.attendance = 'during' AND v.temperature = 'cold'),
    COALESCE((SELECT jsonb_object_agg(k, c) FROM (
      SELECT v.price_feedback AS k, count(*)::int AS c FROM open_house_visitors v
      WHERE v.open_house_id = oh.id AND v.attendance = 'during' AND v.price_feedback IS NOT NULL GROUP BY 1) t), '{}'::jsonb),
    COALESCE((SELECT jsonb_object_agg(k, c) FROM (
      SELECT v.condition_feedback AS k, count(*)::int AS c FROM open_house_visitors v
      WHERE v.open_house_id = oh.id AND v.attendance = 'during' AND v.condition_feedback IS NOT NULL GROUP BY 1) t), '{}'::jsonb)
  FROM open_houses oh
  LEFT JOIN profiles p ON p.id = oh.hosting_agent_id
  WHERE oh.slug = _slug
    AND oh.ends_at IS NOT NULL
    AND oh.ends_at < now()
  LIMIT 1;
$function$;

-- 4. Permanent agent QR: running now -> next upcoming -> contact card
DROP FUNCTION IF EXISTS public.public_agent_open_house(text);
CREATE FUNCTION public.public_agent_open_house(_agent_slug text)
RETURNS TABLE(agent_name text, agent_email text, agent_avatar_url text, active_slug text, status text, house_address text, house_starts_at timestamp with time zone, house_ends_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT p.id, p.full_name, p.email, p.avatar_url
    FROM public.profiles p WHERE p.agent_slug = _agent_slug LIMIT 1
  ),
  mine AS (
    SELECT oh.slug, oh.property_address, oh.starts_at, oh.ends_at, oh.open_house_date
    FROM public.open_houses oh, me
    WHERE coalesce(oh.hosting_agent_id, oh.user_id) = me.id
      AND oh.is_active = true
      AND oh.slug IS NOT NULL
  ),
  picked AS (
    SELECT * FROM (
      -- 1. Running now (45 min grace before, 60 after)
      SELECT slug, property_address, starts_at, ends_at, 0 AS rank_group, starts_at AS ord, 'running'::text AS status
      FROM mine
      WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL
        AND now() >= starts_at - interval '45 minutes'
        AND now() <= ends_at + interval '60 minutes'
      UNION ALL
      -- 2. Otherwise the next upcoming one, any future date
      SELECT slug, property_address, starts_at, ends_at, 1, coalesce(starts_at, (open_house_date + time '00:00') AT TIME ZONE 'America/Toronto'), 'upcoming'
      FROM mine
      WHERE coalesce(ends_at, starts_at, (open_house_date + time '23:59') AT TIME ZONE 'America/Toronto') > now()
    ) c
    ORDER BY rank_group, ord ASC NULLS LAST
    LIMIT 1
  )
  SELECT me.full_name, me.email, me.avatar_url,
         picked.slug, coalesce(picked.status, 'none'),
         picked.property_address, picked.starts_at, picked.ends_at
  FROM me LEFT JOIN picked ON true;
$function$;

-- 5. Leads captured from a QR with no open house
CREATE TABLE IF NOT EXISTS public.agent_qr_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid,
  first_name text NOT NULL,
  last_name text,
  email text,
  phone text,
  intent text CHECK (intent IS NULL OR intent = ANY (ARRAY['buying'::text,'selling'::text,'both'::text,'just_looking'::text])),
  source text NOT NULL DEFAULT 'Agent QR - no open house',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_qr_leads TO authenticated;
GRANT ALL ON public.agent_qr_leads TO service_role;
ALTER TABLE public.agent_qr_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agents read their own QR leads" ON public.agent_qr_leads;
CREATE POLICY "Agents read their own QR leads" ON public.agent_qr_leads
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id()));
DROP POLICY IF EXISTS "Agents update their own QR leads" ON public.agent_qr_leads;
CREATE POLICY "Agents update their own QR leads" ON public.agent_qr_leads
  FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id()))
  WITH CHECK (agent_id = auth.uid() OR (public.is_admin_or_owner(auth.uid()) AND org_id = public.current_user_org_id()));
CREATE INDEX IF NOT EXISTS agent_qr_leads_agent_idx ON public.agent_qr_leads (agent_id, created_at DESC);
DROP TRIGGER IF EXISTS agent_qr_leads_updated_at ON public.agent_qr_leads;
CREATE TRIGGER agent_qr_leads_updated_at BEFORE UPDATE ON public.agent_qr_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.submit_agent_qr_lead(_agent_slug text, _first_name text, _last_name text, _email text, _phone text, _intent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.profiles%ROWTYPE;
  clean_phone text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
BEGIN
  SELECT * INTO p FROM public.profiles WHERE agent_slug = _agent_slug LIMIT 1;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'We could not find that agent.';
  END IF;
  IF coalesce(btrim(_first_name), '') = '' THEN
    RAISE EXCEPTION 'Please tell us your name.';
  END IF;
  IF coalesce(btrim(_email), '') = '' AND length(clean_phone) < 10 THEN
    RAISE EXCEPTION 'Please provide a phone number or an email address.';
  END IF;

  INSERT INTO public.agent_qr_leads (agent_id, org_id, first_name, last_name, email, phone, intent)
  VALUES (p.id, p.org_id, btrim(_first_name), nullif(btrim(coalesce(_last_name, '')), ''),
          nullif(btrim(lower(coalesce(_email, ''))), ''), nullif(clean_phone, ''),
          nullif(btrim(coalesce(_intent, '')), ''));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_agent_qr_lead(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_agent_open_house(text) TO anon, authenticated;
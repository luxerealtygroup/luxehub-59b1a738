-- 1. Extend open_houses with sign-in fields
ALTER TABLE public.open_houses
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS mls_number text,
  ADD COLUMN IF NOT EXISTS list_price numeric,
  ADD COLUMN IF NOT EXISTS cover_photo_url text,
  ADD COLUMN IF NOT EXISTS hosting_agent_id uuid,
  ADD COLUMN IF NOT EXISTS listing_agent_id uuid,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS disclosure_text text,
  ADD COLUMN IF NOT EXISTS require_phone boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_question_1 text,
  ADD COLUMN IF NOT EXISTS custom_question_2 text,
  ADD COLUMN IF NOT EXISTS custom_question_3 text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS open_houses_slug_key ON public.open_houses (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS open_houses_hosting_agent_idx ON public.open_houses (hosting_agent_id);

-- 2. Permanent per-agent link code
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS agent_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_agent_slug_key ON public.profiles (agent_slug) WHERE agent_slug IS NOT NULL;

-- 3. Visitors
CREATE TABLE IF NOT EXISTS public.open_house_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_house_id uuid NOT NULL REFERENCES public.open_houses(id) ON DELETE CASCADE,
  org_id uuid,
  first_name text NOT NULL,
  last_name text,
  email text,
  phone text,
  working_with_agent boolean,
  agent_name text,
  intent text,
  has_home_to_sell text,
  timeline text,
  lender_status text,
  custom_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  disclosure_accepted boolean NOT NULL DEFAULT false,
  notes text,
  signed_in_at timestamptz NOT NULL DEFAULT now(),
  client_captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT open_house_visitors_contact_required CHECK (
    coalesce(btrim(email), '') <> '' OR coalesce(btrim(phone), '') <> ''
  ),
  CONSTRAINT open_house_visitors_intent_check CHECK (
    intent IS NULL OR intent IN ('buying','selling','both','just_looking','neighbour')
  ),
  CONSTRAINT open_house_visitors_home_check CHECK (
    has_home_to_sell IS NULL OR has_home_to_sell IN ('yes','no','unsure')
  ),
  CONSTRAINT open_house_visitors_timeline_check CHECK (
    timeline IS NULL OR timeline IN ('now','1_3_months','3_6_months','6_12_months','12_plus_months','unsure')
  ),
  CONSTRAINT open_house_visitors_lender_check CHECK (
    lender_status IS NULL OR lender_status IN ('pre_approved','pre_qualified','not_yet','unsure')
  )
);

CREATE INDEX IF NOT EXISTS open_house_visitors_house_idx ON public.open_house_visitors (open_house_id, created_at DESC);

GRANT SELECT ON public.open_house_visitors TO authenticated;
GRANT ALL ON public.open_house_visitors TO service_role;

ALTER TABLE public.open_house_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents read visitors for their own open houses"
ON public.open_house_visitors FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.open_houses oh
    WHERE oh.id = open_house_visitors.open_house_id
      AND oh.org_id = public.current_user_org_id()
      AND (oh.user_id = auth.uid() OR oh.hosting_agent_id = auth.uid() OR oh.listing_agent_id = auth.uid())
  )
);

CREATE POLICY "Admins read all visitors in their org"
ON public.open_house_visitors FOR SELECT TO authenticated
USING (
  public.is_admin_or_owner(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.open_houses oh
    WHERE oh.id = open_house_visitors.open_house_id
      AND oh.org_id = public.current_user_org_id()
  )
);

-- 4. Hosting agents can read the open houses they host
CREATE POLICY "Hosting agents read their open houses"
ON public.open_houses FOR SELECT TO authenticated
USING (
  org_id = public.current_user_org_id()
  AND (hosting_agent_id = auth.uid() OR listing_agent_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))
);

-- 5. Public read of one open house's sign-in details (no visitor data)
CREATE OR REPLACE FUNCTION public.public_open_house(_slug text)
RETURNS TABLE (
  id uuid, slug text, address text, city text, mls_number text, list_price numeric,
  cover_photo_url text, starts_at timestamptz, ends_at timestamptz, disclosure_text text,
  require_phone boolean, custom_question_1 text, custom_question_2 text, custom_question_3 text,
  hosting_agent_name text, hosting_agent_email text, hosting_agent_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oh.id, oh.slug, oh.property_address, oh.city, oh.mls_number, oh.list_price,
         oh.cover_photo_url, oh.starts_at, oh.ends_at, oh.disclosure_text,
         oh.require_phone, oh.custom_question_1, oh.custom_question_2, oh.custom_question_3,
         p.full_name, p.email, p.avatar_url
  FROM public.open_houses oh
  LEFT JOIN public.profiles p ON p.id = coalesce(oh.hosting_agent_id, oh.user_id)
  WHERE oh.slug = _slug AND oh.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.public_open_house(text) TO anon, authenticated;

-- 6. Permanent agent QR target: whichever open house is live right now
CREATE OR REPLACE FUNCTION public.public_agent_open_house(_agent_slug text)
RETURNS TABLE (
  agent_name text, agent_email text, agent_avatar_url text, active_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name, p.email, p.avatar_url,
    (
      SELECT oh.slug FROM public.open_houses oh
      WHERE coalesce(oh.hosting_agent_id, oh.user_id) = p.id
        AND oh.is_active = true
        AND oh.slug IS NOT NULL
        AND (oh.starts_at IS NULL OR oh.starts_at <= now())
        AND (oh.ends_at IS NULL OR oh.ends_at >= now())
      ORDER BY oh.starts_at DESC NULLS LAST
      LIMIT 1
    )
  FROM public.profiles p
  WHERE p.agent_slug = _agent_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.public_agent_open_house(text) TO anon, authenticated;

-- 7. Anonymous sign-in submission (write-only, returns nothing readable)
CREATE OR REPLACE FUNCTION public.submit_open_house_visitor(
  _slug text,
  _first_name text,
  _last_name text,
  _email text,
  _phone text,
  _working_with_agent boolean,
  _agent_name text,
  _intent text,
  _has_home_to_sell text,
  _timeline text,
  _lender_status text,
  _custom_answers jsonb,
  _disclosure_accepted boolean,
  _notes text,
  _client_captured_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oh public.open_houses%ROWTYPE;
  clean_phone text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
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

  INSERT INTO public.open_house_visitors (
    open_house_id, org_id, first_name, last_name, email, phone,
    working_with_agent, agent_name, intent, has_home_to_sell, timeline, lender_status,
    custom_answers, disclosure_accepted, notes, client_captured_at
  ) VALUES (
    oh.id, oh.org_id, btrim(_first_name), nullif(btrim(coalesce(_last_name, '')), ''),
    nullif(btrim(lower(coalesce(_email, ''))), ''), nullif(clean_phone, ''),
    _working_with_agent, nullif(btrim(coalesce(_agent_name, '')), ''),
    _intent, _has_home_to_sell, _timeline, _lender_status,
    coalesce(_custom_answers, '{}'::jsonb), coalesce(_disclosure_accepted, false),
    nullif(btrim(coalesce(_notes, '')), ''), _client_captured_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_open_house_visitor(
  text, text, text, text, text, boolean, text, text, text, text, text, jsonb, boolean, text, timestamptz
) TO anon, authenticated;
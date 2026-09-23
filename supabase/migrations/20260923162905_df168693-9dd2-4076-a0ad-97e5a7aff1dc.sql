ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS fub_tier text,
  ADD COLUMN IF NOT EXISTS fub_tier_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS fub_event_id text,
  ADD COLUMN IF NOT EXISTS casl_consent boolean,
  ADD COLUMN IF NOT EXISTS casl_consent_at timestamptz;

ALTER TABLE public.open_house_visitors
  ADD CONSTRAINT open_house_visitors_fub_tier_check CHECK (
    fub_tier IS NULL OR fub_tier IN ('Ready to Go','Pre-Approved','Early Stages','Hot Lead','Warm Lead','Cool Lead','Nurture','OH – No Read')
  );

ALTER TABLE public.open_houses ADD COLUMN IF NOT EXISTS feature_sheet_url text;

CREATE OR REPLACE FUNCTION public.submit_open_house_visitor(_slug text, _first_name text, _last_name text, _email text, _phone text, _working_with_agent boolean, _agent_name text, _intent text, _has_home_to_sell text, _timeline text, _lender_status text, _custom_answers jsonb, _disclosure_accepted boolean, _notes text, _client_captured_at timestamp with time zone, _casl_consent boolean)
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
    custom_answers, disclosure_accepted, notes, client_captured_at, attendance,
    casl_consent, casl_consent_at
  ) VALUES (
    oh.id, oh.org_id, btrim(_first_name), nullif(btrim(coalesce(_last_name, '')), ''),
    nullif(btrim(lower(coalesce(_email, ''))), ''), nullif(clean_phone, ''),
    _working_with_agent, nullif(btrim(coalesce(_agent_name, '')), ''),
    _intent, _has_home_to_sell, _timeline, _lender_status,
    coalesce(_custom_answers, '{}'::jsonb), coalesce(_disclosure_accepted, false),
    nullif(btrim(coalesce(_notes, '')), ''), _client_captured_at, timing,
    coalesce(_casl_consent, false),
    CASE WHEN coalesce(_casl_consent, false) THEN at_time ELSE NULL END
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_open_house_visitor(text,text,text,text,text,boolean,text,text,text,text,text,jsonb,boolean,text,timestamptz,boolean) TO anon, authenticated;
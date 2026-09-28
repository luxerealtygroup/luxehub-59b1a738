ALTER TABLE public.open_house_visitors
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_reason text;

CREATE INDEX IF NOT EXISTS open_house_visitors_is_test_idx ON public.open_house_visitors (is_test) WHERE is_test;

CREATE OR REPLACE FUNCTION public.open_house_visitor_flag_test()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  digits text := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');
  last10 text := right(regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g'), 10);
  em text := lower(trim(coalesce(NEW.email, '')));
  team_phones text;
BEGIN
  IF NEW.is_test THEN RETURN NEW; END IF;

  IF digits <> '' AND digits ~ '^0+$' THEN
    NEW.is_test := true;
    NEW.test_reason := 'Phone number is all zeros';
    RETURN NEW;
  END IF;

  IF em <> '' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.org_id = NEW.org_id
      AND coalesce(p.member_type, '') <> 'client'
      AND (lower(p.email) = em OR lower(coalesce(p.fub_user_email, '')) = em)
  ) THEN
    NEW.is_test := true;
    NEW.test_reason := 'Email belongs to a LuxeHub team member';
    RETURN NEW;
  END IF;

  IF length(last10) = 10 THEN
    SELECT s.value INTO team_phones FROM public.app_settings s
     WHERE s.org_id = NEW.org_id AND s.key = 'open_house_team_phones' LIMIT 1;
    IF team_phones IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(string_to_array(team_phones, ',')) t(ph)
      WHERE right(regexp_replace(ph, '\D', '', 'g'), 10) = last10
    ) THEN
      NEW.is_test := true;
      NEW.test_reason := 'Phone number belongs to a LuxeHub team member';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.open_house_visitor_flag_test() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS open_house_visitor_flag_test ON public.open_house_visitors;
CREATE TRIGGER open_house_visitor_flag_test
BEFORE INSERT ON public.open_house_visitors
FOR EACH ROW EXECUTE FUNCTION public.open_house_visitor_flag_test();

CREATE OR REPLACE FUNCTION public.public_open_house_seller_report(_slug text)
 RETURNS TABLE(address text, city text, list_price numeric, cover_photo_url text, starts_at timestamp with time zone, ends_at timestamp with time zone, hosting_agent_name text, hosting_agent_email text, doors_knocked integer, notes text, visitors integer, with_agent integer, home_to_sell integer, spoken_to_lender integer, hot integer, warm integer, cold integer, price_feedback jsonb, condition_feedback jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    oh.property_address, oh.city, oh.list_price, oh.cover_photo_url, oh.starts_at, oh.ends_at,
    p.full_name, p.email, oh.prep_doors_knocked, oh.seller_notes,
    COALESCE(v.visitors, 0)::int, COALESCE(v.with_agent, 0)::int, COALESCE(v.home_to_sell, 0)::int,
    COALESCE(v.spoken_to_lender, 0)::int, COALESCE(v.hot, 0)::int, COALESCE(v.warm, 0)::int, COALESCE(v.cold, 0)::int,
    COALESCE(v.price_feedback, '{}'::jsonb), COALESCE(v.condition_feedback, '{}'::jsonb)
  FROM public.open_houses oh
  LEFT JOIN public.profiles p ON p.id = oh.hosting_agent_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE ohv.attendance = 'during') AS visitors,
      COUNT(*) FILTER (WHERE ohv.attendance = 'during' AND ohv.working_with_agent IS TRUE) AS with_agent,
      COUNT(*) FILTER (WHERE ohv.attendance = 'during' AND ohv.has_home_to_sell = 'yes') AS home_to_sell,
      COUNT(*) FILTER (WHERE ohv.attendance = 'during' AND ohv.lender_status IN ('pre-approved','pre-qualified')) AS spoken_to_lender,
      COUNT(*) FILTER (WHERE ohv.attendance = 'during' AND ohv.temperature = 'hot') AS hot,
      COUNT(*) FILTER (WHERE ohv.attendance = 'during' AND ohv.temperature = 'warm') AS warm,
      COUNT(*) FILTER (WHERE ohv.attendance = 'during' AND ohv.temperature = 'cold') AS cold,
      (SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb) FROM (
        SELECT price_feedback AS k, COUNT(*) AS n FROM public.open_house_visitors
        WHERE open_house_id = oh.id AND attendance = 'during' AND price_feedback IS NOT NULL AND NOT is_test
        GROUP BY price_feedback) t) AS price_feedback,
      (SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb) FROM (
        SELECT condition_feedback AS k, COUNT(*) AS n FROM public.open_house_visitors
        WHERE open_house_id = oh.id AND attendance = 'during' AND condition_feedback IS NOT NULL AND NOT is_test
        GROUP BY condition_feedback) t) AS condition_feedback
    FROM public.open_house_visitors ohv
    WHERE ohv.open_house_id = oh.id AND NOT ohv.is_test
  ) v ON TRUE
  WHERE oh.slug = _slug
  LIMIT 1
$function$;
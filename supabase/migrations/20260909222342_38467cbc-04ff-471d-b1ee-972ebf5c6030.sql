DROP FUNCTION IF EXISTS public.public_open_house_buyer_report(text);
CREATE FUNCTION public.public_open_house_buyer_report(_token text)
RETURNS TABLE(first_name text, intent text, timeline text, featured_listings jsonb, address text, city text, list_price numeric, cover_photo_url text, hosting_agent_name text, hosting_agent_email text, search_url_template text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    v.first_name,
    v.intent,
    v.timeline,
    COALESCE(v.featured_listings, '[]'::jsonb),
    oh.property_address,
    oh.city,
    oh.list_price,
    oh.cover_photo_url,
    COALESCE(p.full_name, oh.listing_agent_name),
    COALESCE(p.email, oh.listing_agent_email),
    (SELECT s.value FROM app_settings s
      WHERE s.key = 'open_house_search_url_template' AND s.org_id = oh.org_id LIMIT 1)
  FROM open_house_visitors v
  JOIN open_houses oh ON oh.id = v.open_house_id
  LEFT JOIN profiles p ON p.id = oh.hosting_agent_id
  WHERE v.report_token = _token
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.public_open_house_seller_report(_slug text)
RETURNS TABLE(address text, city text, list_price numeric, cover_photo_url text, starts_at timestamp with time zone, ends_at timestamp with time zone, hosting_agent_name text, hosting_agent_email text, doors_knocked integer, notes text, competing_listings jsonb, visitors integer, with_agent integer, home_to_sell integer, spoken_to_lender integer, hot integer, warm integer, cold integer, price_feedback jsonb, condition_feedback jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.working_with_agent IS TRUE),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.has_home_to_sell = 'yes'),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.lender_status IN ('pre_approved','pre_qualified')),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.temperature = 'hot'),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.temperature = 'warm'),
    (SELECT count(*)::int FROM open_house_visitors v WHERE v.open_house_id = oh.id AND v.temperature = 'cold'),
    COALESCE((SELECT jsonb_object_agg(k, c) FROM (
      SELECT v.price_feedback AS k, count(*)::int AS c FROM open_house_visitors v
      WHERE v.open_house_id = oh.id AND v.price_feedback IS NOT NULL GROUP BY 1) t), '{}'::jsonb),
    COALESCE((SELECT jsonb_object_agg(k, c) FROM (
      SELECT v.condition_feedback AS k, count(*)::int AS c FROM open_house_visitors v
      WHERE v.open_house_id = oh.id AND v.condition_feedback IS NOT NULL GROUP BY 1) t), '{}'::jsonb)
  FROM open_houses oh
  LEFT JOIN profiles p ON p.id = oh.hosting_agent_id
  WHERE oh.slug = _slug
    AND oh.ends_at IS NOT NULL
    AND oh.ends_at < now()
  LIMIT 1;
$function$;
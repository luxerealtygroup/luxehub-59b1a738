DROP FUNCTION IF EXISTS public.public_open_house_seller_report(text);

CREATE FUNCTION public.public_open_house_seller_report(_slug text)
RETURNS TABLE(address text, city text, list_price numeric, cover_photo_url text, starts_at timestamp with time zone, ends_at timestamp with time zone, hosting_agent_name text, hosting_agent_email text, doors_knocked integer, notes text, visitors integer, with_agent integer, home_to_sell integer, spoken_to_lender integer, hot integer, warm integer, cold integer, price_feedback jsonb, condition_feedback jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    oh.property_address,
    oh.city,
    oh.list_price,
    oh.cover_photo_url,
    oh.starts_at,
    oh.ends_at,
    p.full_name,
    p.email,
    oh.prep_doors_knocked,
    oh.seller_notes,
    COALESCE(v.visitors, 0)::int,
    COALESCE(v.with_agent, 0)::int,
    COALESCE(v.home_to_sell, 0)::int,
    COALESCE(v.spoken_to_lender, 0)::int,
    COALESCE(v.hot, 0)::int,
    COALESCE(v.warm, 0)::int,
    COALESCE(v.cold, 0)::int,
    COALESCE(v.price_feedback, '{}'::jsonb),
    COALESCE(v.condition_feedback, '{}'::jsonb)
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
      (
        SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb)
        FROM (
          SELECT price_feedback AS k, COUNT(*) AS n
          FROM public.open_house_visitors
          WHERE open_house_id = oh.id AND attendance = 'during' AND price_feedback IS NOT NULL
          GROUP BY price_feedback
        ) t
      ) AS price_feedback,
      (
        SELECT COALESCE(jsonb_object_agg(t.k, t.n), '{}'::jsonb)
        FROM (
          SELECT condition_feedback AS k, COUNT(*) AS n
          FROM public.open_house_visitors
          WHERE open_house_id = oh.id AND attendance = 'during' AND condition_feedback IS NOT NULL
          GROUP BY condition_feedback
        ) t
      ) AS condition_feedback
    FROM public.open_house_visitors ohv
    WHERE ohv.open_house_id = oh.id
  ) v ON TRUE
  WHERE oh.slug = _slug
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.public_open_house_seller_report(text) TO anon, authenticated;

ALTER TABLE public.open_houses DROP COLUMN IF EXISTS competing_listings;

ALTER TABLE public.open_house_visitors ADD COLUMN IF NOT EXISTS fub_note_updated_at timestamptz;
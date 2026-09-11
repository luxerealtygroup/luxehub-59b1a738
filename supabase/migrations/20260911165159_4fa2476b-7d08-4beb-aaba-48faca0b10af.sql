CREATE OR REPLACE FUNCTION public.public_agent_open_house(_agent_slug text)
RETURNS TABLE(agent_name text, agent_email text, agent_avatar_url text, active_slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.full_name, p.email, p.avatar_url,
    (
      WITH agent_today AS (
        SELECT oh.slug,
               -- Fall back to the calendar date when the row predates start/end times.
               oh.starts_at AS s,
               oh.ends_at AS e,
               (oh.open_house_date = (now() AT TIME ZONE 'America/Toronto')::date) AS is_today
        FROM public.open_houses oh
        WHERE coalesce(oh.hosting_agent_id, oh.user_id) = p.id
          AND oh.is_active = true
          AND oh.slug IS NOT NULL
          AND oh.open_house_date = (now() AT TIME ZONE 'America/Toronto')::date
      )
      SELECT slug FROM (
        -- 1. Running now, with 45 minutes of grace before and 60 after.
        SELECT slug, 0 AS rank_group, s
        FROM agent_today
        WHERE s IS NOT NULL AND e IS NOT NULL
          AND now() >= s - interval '45 minutes'
          AND now() <= e + interval '60 minutes'
        UNION ALL
        -- 2. Otherwise anything else still scheduled for today.
        SELECT slug, 1 AS rank_group, s
        FROM agent_today
        WHERE (s IS NULL OR now() <= coalesce(e, s) + interval '60 minutes')
      ) c
      ORDER BY rank_group, s ASC NULLS LAST
      LIMIT 1
    )
  FROM public.profiles p
  WHERE p.agent_slug = _agent_slug
  LIMIT 1;
$function$;
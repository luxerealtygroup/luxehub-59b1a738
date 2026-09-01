ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS branding_text_color text,
  ADD COLUMN IF NOT EXISTS branding_mark_url text;

COMMENT ON COLUMN public.organizations.branding_primary_color IS
  'Brand colour for the logo mark and large accents only. May fail WCAG AA on white.';
COMMENT ON COLUMN public.organizations.branding_text_color IS
  'Derived accessible shade (>= 4.5:1 on white) used for body text, links, small labels and filled button backgrounds.';
COMMENT ON COLUMN public.organizations.branding_logo_url IS 'Wide wordmark lockup; render height-constrained, width auto.';
COMMENT ON COLUMN public.organizations.branding_mark_url IS 'Square mark for avatars and favicon.';

DROP FUNCTION IF EXISTS public.resolve_org_by_host(text);

CREATE FUNCTION public.resolve_org_by_host(_host text)
RETURNS TABLE(id uuid, slug text, name text, app_name text, short_name text,
              brokerage_name text, branding_logo_url text, branding_mark_url text,
              branding_primary_color text, branding_text_color text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT o.id, o.slug, o.name, o.app_name, o.short_name,
         o.brokerage_name, o.branding_logo_url, o.branding_mark_url,
         o.branding_primary_color, o.branding_text_color
  FROM public.organizations o
  WHERE _host IS NOT NULL
    AND (
      lower(o.website_domain) = lower(regexp_replace(_host, '^www\.', ''))
      OR lower(o.slug) = lower(split_part(regexp_replace(_host, '^www\.', ''), '.', 1))
    )
  LIMIT 1
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_org_by_host(text) TO anon, authenticated;
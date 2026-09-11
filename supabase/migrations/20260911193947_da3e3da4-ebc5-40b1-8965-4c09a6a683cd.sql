DROP POLICY IF EXISTS "Hosting and listing agents manage their open houses" ON public.open_houses;
CREATE POLICY "Hosting and listing agents manage their open houses"
ON public.open_houses
FOR ALL
TO authenticated
USING (
  org_id = current_user_org_id()
  AND (hosting_agent_id = auth.uid() OR listing_agent_id = auth.uid() OR is_admin_or_owner(auth.uid()))
)
WITH CHECK (
  org_id = current_user_org_id()
  AND (hosting_agent_id = auth.uid() OR listing_agent_id = auth.uid() OR is_admin_or_owner(auth.uid()))
);

DROP FUNCTION IF EXISTS public.public_open_house(text);
CREATE FUNCTION public.public_open_house(_slug text)
RETURNS TABLE(id uuid, slug text, address text, city text, mls_number text, list_price numeric, cover_photo_url text, starts_at timestamp with time zone, ends_at timestamp with time zone, disclosure_text text, require_phone boolean, custom_question_1 text, custom_question_2 text, custom_question_3 text, hosting_agent_name text, hosting_agent_email text, hosting_agent_avatar_url text, search_url_template text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oh.id, oh.slug, oh.property_address, oh.city, oh.mls_number, oh.list_price,
         oh.cover_photo_url, oh.starts_at, oh.ends_at, oh.disclosure_text,
         oh.require_phone, oh.custom_question_1, oh.custom_question_2, oh.custom_question_3,
         p.full_name, p.email, p.avatar_url,
         (SELECT s.value FROM public.app_settings s
           WHERE s.org_id = oh.org_id AND s.key = 'open_house_search_url_template'
           LIMIT 1)
  FROM public.open_houses oh
  LEFT JOIN public.profiles p ON p.id = coalesce(oh.hosting_agent_id, oh.user_id)
  WHERE oh.slug = _slug AND oh.is_active = true
  LIMIT 1;
$$;
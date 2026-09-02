UPDATE public.profiles
SET org_id = 'e4295d7b-c889-459f-81ef-4ee90bc939a7',
    full_name = 'Kristen Schulz'
WHERE id = '64f1aefc-f55b-4987-95d4-4bef67c06781';

DELETE FROM public.user_roles
WHERE user_id = '64f1aefc-f55b-4987-95d4-4bef67c06781' AND role = 'agent';

UPDATE public.org_invites
SET revoked_at = now(), token = NULL
WHERE email = 'info+ke@luxerealtygroup.ca';

UPDATE public.organizations SET seat_limit = 1 WHERE slug = 'kirstineellis';
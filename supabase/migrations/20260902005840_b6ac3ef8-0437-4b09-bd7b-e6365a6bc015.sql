UPDATE public.organizations SET seat_limit = 2 WHERE slug = 'kirstineellis';

INSERT INTO public.org_invites (org_id, email, role, full_name, token, expires_at)
SELECT id, 'info+ke@luxerealtygroup.ca', 'agent'::app_role, 'Kristen (test seat)',
       '0f1ad1aacdfc17161d61b548d8da7ef08d0e62d2e4182256da8e201538e67675',
       now() + interval '14 days'
FROM public.organizations WHERE slug = 'kirstineellis';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
UPDATE public.profiles SET email = u.email FROM auth.users u WHERE u.id = profiles.id;
ALTER TABLE public.client_accounts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.client_accounts DROP CONSTRAINT IF EXISTS client_accounts_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS client_accounts_user_id_unique ON public.client_accounts (user_id) WHERE user_id IS NOT NULL;
UPDATE public.client_accounts ca SET user_id = NULL WHERE ca.user_id IN (SELECT id FROM public.profiles);
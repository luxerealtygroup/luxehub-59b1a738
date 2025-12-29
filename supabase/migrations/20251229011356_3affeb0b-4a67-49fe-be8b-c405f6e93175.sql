-- Add FUB user ID to profiles for agent mapping
ALTER TABLE public.profiles 
ADD COLUMN fub_user_id integer DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.fub_user_id IS 'Follow Up Boss user ID for matching contacts to agents';
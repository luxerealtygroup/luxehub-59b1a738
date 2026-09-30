SELECT set_config('app.allow_member_type_change', 'on', true);
UPDATE public.profiles
SET member_type = 'system',
    access_expires_at = now()
WHERE id = '49d00674-3a59-43e6-9c80-440be8730fd8';
SELECT set_config('app.allow_member_type_change', 'off', true);
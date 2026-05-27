UPDATE auth.users
SET encrypted_password = crypt('LuxeTemp2026!', gen_salt('bf')),
    updated_at = now()
WHERE id = '4ab11461-fd13-405d-9521-82665c094f86';
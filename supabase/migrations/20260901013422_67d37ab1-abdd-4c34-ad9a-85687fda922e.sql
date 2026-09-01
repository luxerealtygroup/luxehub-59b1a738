-- Instance integration credential registry (metadata only; values live in Vault)
CREATE TABLE IF NOT EXISTS public.instance_integrations (
  key text PRIMARY KEY,
  vault_secret_name text NOT NULL,
  last4 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.instance_integrations TO authenticated;
GRANT ALL ON public.instance_integrations TO service_role;

ALTER TABLE public.instance_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view integration status" ON public.instance_integrations;
CREATE POLICY "Owners can view integration status"
ON public.instance_integrations
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner'));

-- Write a secret into Vault and record its metadata. Service role only.
CREATE OR REPLACE FUNCTION public.set_instance_secret(_key text, _value text, _actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  IF _key NOT IN ('FUB_API_KEY', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET') THEN
    RAISE EXCEPTION 'Unknown integration key';
  END IF;
  IF _value IS NULL OR length(trim(_value)) = 0 THEN
    RAISE EXCEPTION 'Empty credential';
  END IF;

  v_name := 'instance_' || lower(_key);

  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(_value, v_name, 'Owner-configured instance integration credential');
  ELSE
    PERFORM vault.update_secret(v_id, _value, v_name, 'Owner-configured instance integration credential');
  END IF;

  INSERT INTO public.instance_integrations (key, vault_secret_name, last4, updated_at, updated_by)
  VALUES (_key, v_name, right(trim(_value), 4), now(), _actor)
  ON CONFLICT (key) DO UPDATE
    SET vault_secret_name = EXCLUDED.vault_secret_name,
        last4 = EXCLUDED.last4,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by;
END;
$$;

REVOKE ALL ON FUNCTION public.set_instance_secret(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_instance_secret(text, text, uuid) TO service_role;

-- Read a secret back. Service role only; never exposed to any client role.
CREATE OR REPLACE FUNCTION public.get_instance_secret(_key text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_val text;
BEGIN
  IF _key NOT IN ('FUB_API_KEY', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET') THEN
    RETURN NULL;
  END IF;
  SELECT s.decrypted_secret INTO v_val
  FROM vault.decrypted_secrets s
  WHERE s.name = 'instance_' || lower(_key);
  RETURN v_val;
END;
$$;

REVOKE ALL ON FUNCTION public.get_instance_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_instance_secret(text) TO service_role;
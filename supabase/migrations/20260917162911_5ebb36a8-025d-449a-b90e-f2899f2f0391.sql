-- Release any remaining references to a user that would block deleting them.
CREATE OR REPLACE FUNCTION public.admin_release_user_refs(_user_id uuid, _fallback uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, a.attnotnull AS notnull
    FROM pg_constraint c
    JOIN unnest(c.conkey) k ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype IN ('a','r','n')
      AND n.nspname = 'public'
  LOOP
    IF r.notnull THEN
      IF _fallback IS NOT NULL THEN
        EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col) USING _fallback, _user_id;
      ELSE
        EXECUTE format('DELETE FROM %s WHERE %I = $1', r.tbl, r.col) USING _user_id;
      END IF;
    ELSE
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING _user_id;
    END IF;
  END LOOP;
END;
$$;

-- Client self-deletion: keep the business record, drop the login link.
CREATE OR REPLACE FUNCTION public.admin_detach_client_login(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.client_accounts
  SET user_id = NULL, updated_at = now()
  WHERE user_id = _user_id;
  GET DIAGNOSTICS n = ROW_COUNT;

  PERFORM public.admin_release_user_refs(_user_id, NULL);
  DELETE FROM public.profiles WHERE id = _user_id;
  RETURN n;
END;
$$;

-- Agent self-deletion: hand the business records to the hub owner.
CREATE OR REPLACE FUNCTION public.admin_reassign_agent_records(_from uuid, _to uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  moves text[][] := ARRAY[
    ARRAY['pipeline_clients','user_id'],
    ARRAY['client_accounts','agent_id'],
    ARRAY['client_transactions','agent_id'],
    ARRAY['deals','user_id'],
    ARRAY['commissions','user_id'],
    ARRAY['open_houses','user_id'],
    ARRAY['open_houses','created_by'],
    ARRAY['submissions','user_id'],
    ARRAY['cma_reports','user_id'],
    ARRAY['deal_sources','agent_id'],
    ARRAY['support_tickets','user_id']
  ];
  i integer;
  n integer;
  out jsonb := '{}'::jsonb;
BEGIN
  IF _to IS NULL THEN
    RAISE EXCEPTION 'no owner available to receive records';
  END IF;

  FOR i IN 1 .. array_length(moves, 1) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = moves[i][1] AND column_name = moves[i][2]
    ) THEN
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', moves[i][1], moves[i][2], moves[i][2])
        USING _to, _from;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN
        out := out || jsonb_build_object(moves[i][1] || '.' || moves[i][2], n);
      END IF;
    END IF;
  END LOOP;

  PERFORM public.admin_release_user_refs(_from, _to);
  DELETE FROM public.user_roles WHERE user_id = _from;
  DELETE FROM public.profiles WHERE id = _from;
  RETURN out;
END;
$$;

-- Owner self-deletion: erase the whole hub.
CREATE OR REPLACE FUNCTION public.admin_purge_org(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pass integer;
  r record;
  remaining integer := 0;
  deleted jsonb := '{}'::jsonb;
  n integer;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'org id required';
  END IF;

  -- Several tables reference each other, so sweep repeatedly until settled.
  FOR pass IN 1 .. 6 LOOP
    remaining := 0;
    FOR r IN
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'org_id' AND table_name <> 'account_deletion_log'
      ORDER BY table_name
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE org_id = $1', r.table_name) USING _org_id;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          deleted := deleted || jsonb_build_object(r.table_name, COALESCE((deleted->>r.table_name)::int, 0) + n);
        END IF;
      EXCEPTION WHEN foreign_key_violation THEN
        remaining := remaining + 1;
      END;
    END LOOP;
    EXIT WHEN remaining = 0;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'could not clear all hub records (% tables still blocked)', remaining;
  END IF;

  DELETE FROM public.organizations WHERE id = _org_id;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_release_user_refs(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_detach_client_login(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reassign_agent_records(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_purge_org(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_user_refs(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_detach_client_login(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reassign_agent_records(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_org(uuid) TO service_role;
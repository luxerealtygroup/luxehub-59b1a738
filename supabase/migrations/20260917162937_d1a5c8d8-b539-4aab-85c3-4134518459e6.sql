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
    ARRAY['client_accounts','invited_by'],
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

REVOKE ALL ON FUNCTION public.admin_reassign_agent_records(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reassign_agent_records(uuid, uuid) TO service_role;
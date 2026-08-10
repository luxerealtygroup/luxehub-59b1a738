DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname='public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.t);
  END LOOP;
END $$;

GRANT INSERT ON public.ac_nominations TO anon;
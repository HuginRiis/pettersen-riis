CREATE OR REPLACE FUNCTION public.export_list_tables()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE r record; v jsonb := '[]'::jsonb; n bigint;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
           WHERE ns.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.relname) INTO n;
    v := v || jsonb_build_object('table', r.relname, 'rows', n);
  END LOOP;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.export_table_rows(p_table text, p_offset int, p_limit int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE v_oid oid; v_order text; v jsonb;
BEGIN
  SELECT c.oid INTO v_oid FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND c.relname=p_table;
  IF v_oid IS NULL THEN RAISE EXCEPTION 'unknown table %', p_table; END IF;
  SELECT string_agg(format('t.%I', a.attname), ',' ORDER BY array_position(i.indkey::int2[], a.attnum))
    INTO v_order FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum = ANY(i.indkey)
   WHERE i.indrelid=v_oid AND i.indisprimary;
  IF v_order IS NULL THEN v_order := 't.ctid'; END IF;
  EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), ''[]''::jsonb) FROM (SELECT t.* FROM public.%I t ORDER BY %s OFFSET %s LIMIT %s) s',
    p_table, v_order, GREATEST(p_offset,0), LEAST(GREATEST(p_limit,1),1000)) INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.export_list_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.export_table_rows(text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_list_tables() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_table_rows(text,int,int) TO service_role;
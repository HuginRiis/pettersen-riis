
CREATE OR REPLACE FUNCTION public.get_pgnet_cache_size()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  v_bytes bigint := 0;
  v_rows bigint := 0;
BEGIN
  BEGIN
    SELECT pg_total_relation_size('net._http_response'::regclass) INTO v_bytes;
    SELECT count(*) FROM net._http_response INTO v_rows;
  EXCEPTION WHEN OTHERS THEN
    v_bytes := 0;
    v_rows := 0;
  END;
  RETURN jsonb_build_object('bytes', v_bytes, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_pgnet_cache()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  v_before_bytes bigint := 0;
  v_before_rows bigint := 0;
  v_after_bytes bigint := 0;
BEGIN
  SELECT pg_total_relation_size('net._http_response'::regclass) INTO v_before_bytes;
  SELECT count(*) FROM net._http_response INTO v_before_rows;
  TRUNCATE TABLE net._http_response;
  SELECT pg_total_relation_size('net._http_response'::regclass) INTO v_after_bytes;
  RETURN jsonb_build_object(
    'deleted_rows', v_before_rows,
    'freed_bytes', GREATEST(v_before_bytes - v_after_bytes, 0),
    'before_bytes', v_before_bytes,
    'after_bytes', v_after_bytes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pgnet_cache_size() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_pgnet_cache() TO service_role;

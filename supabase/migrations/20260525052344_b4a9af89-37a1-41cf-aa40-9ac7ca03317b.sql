CREATE OR REPLACE FUNCTION public.get_table_bytes(_table text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_bytes bigint;
BEGIN
  SELECT pg_total_relation_size(format('public.%I', _table)::regclass) INTO v_bytes;
  RETURN COALESCE(v_bytes, 0);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$;
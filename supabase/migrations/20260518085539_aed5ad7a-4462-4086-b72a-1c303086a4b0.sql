CREATE OR REPLACE FUNCTION public.get_storage_usage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_catalog
AS $$
DECLARE
  v_buckets jsonb;
BEGIN
  SELECT jsonb_agg(b ORDER BY (b->>'bytes')::bigint DESC) INTO v_buckets
  FROM (
    SELECT jsonb_build_object(
      'bucket', bucket_id,
      'bytes', COALESCE(SUM((metadata->>'size')::bigint), 0),
      'objects', COUNT(*)
    ) AS b
    FROM storage.objects
    GROUP BY bucket_id
  ) sub;
  RETURN jsonb_build_object('buckets', COALESCE(v_buckets, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_db_usage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, cron
AS $$
DECLARE
  result jsonb;
  v_db_bytes bigint;
  v_tables jsonb;
  v_cron jsonb;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  SELECT jsonb_agg(t ORDER BY (t->>'bytes')::bigint DESC) INTO v_tables
  FROM (
    SELECT jsonb_build_object(
      'table', schemaname || '.' || relname,
      'size_pretty', pg_size_pretty(pg_total_relation_size(relid)),
      'bytes', pg_total_relation_size(relid),
      'rows', n_live_tup
    ) AS t
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 30
  ) sub;

  BEGIN
    SELECT jsonb_agg(c) INTO v_cron
    FROM (
      SELECT
        j.jobname,
        j.schedule,
        j.active,
        MAX(r.start_time)::text AS last_run,
        COUNT(r.*) FILTER (WHERE r.start_time > now() - interval '24 hours') AS runs_24h,
        COUNT(r.*) FILTER (WHERE r.status = 'failed' AND r.start_time > now() - interval '24 hours') AS failed_24h
      FROM cron.job j
      LEFT JOIN cron.job_run_details r ON r.jobid = j.jobid
      GROUP BY j.jobname, j.schedule, j.active
      ORDER BY j.jobname
    ) c;
  EXCEPTION WHEN OTHERS THEN
    v_cron := '[]'::jsonb;
  END;

  result := jsonb_build_object(
    'db_bytes', v_db_bytes,
    'tables', COALESCE(v_tables, '[]'::jsonb),
    'cron_jobs', COALESCE(v_cron, '[]'::jsonb)
  );
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_db_usage_stats() TO anon, authenticated, service_role;

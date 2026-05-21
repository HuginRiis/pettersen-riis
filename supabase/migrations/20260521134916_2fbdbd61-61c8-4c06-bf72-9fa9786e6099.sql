
CREATE OR REPLACE FUNCTION public.get_db_detail_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'information_schema', 'cron'
AS $$
DECLARE
  v_db_bytes bigint;
  v_tables jsonb;
  v_views jsonb;
  v_cron jsonb;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  SELECT jsonb_agg(t ORDER BY (t->>'bytes')::bigint DESC) INTO v_tables
  FROM (
    SELECT jsonb_build_object(
      'schema', s.schemaname,
      'table', s.relname,
      'bytes', pg_total_relation_size(c.oid),
      'table_bytes', pg_relation_size(c.oid),
      'index_bytes', pg_indexes_size(c.oid),
      'toast_bytes', COALESCE(pg_total_relation_size(c.reltoastrelid), 0),
      'rows', s.n_live_tup,
      'inserts', s.n_tup_ins,
      'updates', s.n_tup_upd,
      'deletes', s.n_tup_del,
      'last_vacuum', GREATEST(s.last_vacuum, s.last_autovacuum),
      'last_analyze', GREATEST(s.last_analyze, s.last_autoanalyze)
    ) AS t
    FROM pg_stat_user_tables s
    JOIN pg_class c ON c.oid = s.relid
    WHERE s.schemaname = 'public'
  ) sub;

  SELECT jsonb_agg(v ORDER BY v->>'view') INTO v_views
  FROM (
    SELECT jsonb_build_object(
      'schema', schemaname,
      'view', viewname,
      'is_materialized', false
    ) AS v
    FROM pg_views WHERE schemaname = 'public'
    UNION ALL
    SELECT jsonb_build_object(
      'schema', schemaname,
      'view', matviewname,
      'is_materialized', true,
      'bytes', pg_total_relation_size(format('%I.%I', schemaname, matviewname)::regclass)
    )
    FROM pg_matviews WHERE schemaname = 'public'
  ) vw;

  BEGIN
    SELECT jsonb_agg(c ORDER BY c->>'jobname') INTO v_cron
    FROM (
      SELECT jsonb_build_object(
        'jobname', j.jobname,
        'schedule', j.schedule,
        'active', j.active,
        'last_run', MAX(r.start_time),
        'last_success', MAX(r.start_time) FILTER (WHERE r.status = 'succeeded'),
        'runs_24h', COUNT(r.*) FILTER (WHERE r.start_time > now() - interval '24 hours'),
        'failed_24h', COUNT(r.*) FILTER (WHERE r.status = 'failed' AND r.start_time > now() - interval '24 hours')
      ) AS c
      FROM cron.job j
      LEFT JOIN cron.job_run_details r ON r.jobid = j.jobid
      GROUP BY j.jobname, j.schedule, j.active
    ) cc;
  EXCEPTION WHEN OTHERS THEN
    v_cron := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'db_bytes', v_db_bytes,
    'tables', COALESCE(v_tables, '[]'::jsonb),
    'views', COALESCE(v_views, '[]'::jsonb),
    'cron_jobs', COALESCE(v_cron, '[]'::jsonb)
  );
END;
$$;

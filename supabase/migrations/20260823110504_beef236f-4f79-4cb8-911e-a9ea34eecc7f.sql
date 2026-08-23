CREATE OR REPLACE FUNCTION public.get_reclaim_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_catalog
AS $fn$
DECLARE
  v_total int := 0;
  v_done int := 0;
  v_running int := 0;
  v_current text;
BEGIN
  SELECT count(*) INTO v_total
  FROM cron.job
  WHERE jobname LIKE 'reclaim-vac-%' AND jobname <> 'reclaim-vac-cleanup';

  SELECT count(DISTINCT d.jobid) INTO v_done
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname LIKE 'reclaim-vac-%'
    AND j.jobname <> 'reclaim-vac-cleanup'
    AND d.status = 'succeeded';

  SELECT count(*), min(replace(j.jobname, 'reclaim-vac-', ''))
    INTO v_running, v_current
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname LIKE 'reclaim-vac-%'
    AND j.jobname <> 'reclaim-vac-cleanup'
    AND d.status = 'running';

  RETURN jsonb_build_object(
    'active', v_total > 0,
    'total', v_total,
    'done', LEAST(v_done, v_total),
    'running', v_running,
    'current_table', v_current,
    'db_bytes', pg_database_size(current_database())
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_reclaim_progress() TO authenticated, service_role;
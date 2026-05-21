
-- RPC: list cron jobs
CREATE OR REPLACE FUNCTION public.get_cron_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, command text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT j.jobid, j.jobname, j.schedule, j.active, j.command
  FROM cron.job j
  ORDER BY j.jobname;
$$;

-- RPC: update cron job (minutes-based interval, or on-demand)
-- mode = 'cron' → set schedule '*/<minutes> * * * *' (or '* * * * *' if minutes=1) and active=true
-- mode = 'on-demand' → active=false (schedule preserved)
CREATE OR REPLACE FUNCTION public.set_cron_job_config(
  p_jobid bigint,
  p_mode text,
  p_minutes integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_sched text;
BEGIN
  IF p_mode = 'on-demand' THEN
    PERFORM cron.alter_job(job_id := p_jobid, active := false);
  ELSIF p_mode = 'cron' THEN
    IF p_minutes IS NULL OR p_minutes < 1 OR p_minutes > 10080 THEN
      RAISE EXCEPTION 'Ugyldig minutt-intervall: %', p_minutes;
    END IF;
    IF p_minutes = 1 THEN
      v_sched := '* * * * *';
    ELSIF p_minutes < 60 THEN
      v_sched := format('*/%s * * * *', p_minutes);
    ELSIF p_minutes % 60 = 0 AND p_minutes < 1440 THEN
      v_sched := format('0 */%s * * *', p_minutes / 60);
    ELSE
      v_sched := format('*/%s * * * *', p_minutes);
    END IF;
    PERFORM cron.alter_job(job_id := p_jobid, schedule := v_sched, active := true);
  ELSE
    RAISE EXCEPTION 'Ukjent modus: %', p_mode;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_jobs() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_cron_job_config(bigint, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_cron_job_config(bigint, text, integer) TO service_role;

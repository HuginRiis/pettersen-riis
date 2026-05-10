CREATE OR REPLACE FUNCTION public.set_cron_job_active(_jobname text, _active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_catalog
AS $$
DECLARE
  _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = _jobname;
  IF _jobid IS NULL THEN
    RAISE EXCEPTION 'cron job % not found', _jobname;
  END IF;
  PERFORM cron.alter_job(job_id := _jobid, active := _active);
  RETURN true;
END;
$$;
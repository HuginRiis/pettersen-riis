DO $$
DECLARE j_id bigint;
BEGIN
  SELECT jobid INTO j_id FROM cron.job WHERE jobname = 'jaguar-poll-hourly';
  IF j_id IS NOT NULL THEN
    PERFORM cron.unschedule(j_id);
  END IF;
END $$;

DROP TABLE IF EXISTS public.jaguar_snapshots CASCADE;
DROP TABLE IF EXISTS public.jaguar_auth CASCADE;
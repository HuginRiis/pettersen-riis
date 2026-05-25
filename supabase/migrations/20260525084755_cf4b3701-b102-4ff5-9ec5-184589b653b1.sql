DO $$
DECLARE _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'network-snapshot-1m';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
END $$;

DROP TABLE IF EXISTS public.network_snapshots CASCADE;
DROP TABLE IF EXISTS public.flight_alert_prefs CASCADE;
DROP TABLE IF EXISTS public.renovation_images CASCADE;
DROP TABLE IF EXISTS public.renovation_costs CASCADE;
DROP TABLE IF EXISTS public.renovation_contractors CASCADE;
DROP TABLE IF EXISTS public.renovation_tasks CASCADE;
DROP TABLE IF EXISTS public.renovation_projects CASCADE;
DROP TABLE IF EXISTS public.homey_rooms CASCADE;
DROP FUNCTION IF EXISTS public.set_renovation_updated_at();
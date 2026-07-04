CREATE OR REPLACE FUNCTION public.reclaim_space()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_catalog
AS $fn$
DECLARE
  r record;
  v_scheduled text[] := ARRAY[]::text[];
  v_jobname text;
  v_before_bytes bigint;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_before_bytes;

  -- Rydd bort eventuelle gamle reclaim-jobber først
  FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'reclaim-vac-%' LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;

  -- Planlegg VACUUM FULL på alle public-tabeller > 1 MB
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND pg_total_relation_size(c.oid) > 1048576
    ORDER BY pg_total_relation_size(c.oid) DESC
  LOOP
    v_jobname := 'reclaim-vac-' || r.tbl;
    PERFORM cron.schedule(
      v_jobname,
      '* * * * *',
      format('VACUUM (FULL, ANALYZE) public.%I', r.tbl)
    );
    v_scheduled := v_scheduled || v_jobname;
  END LOOP;

  -- Automatisk opprydning av reclaim-jobbene etter 5 minutter
  PERFORM cron.schedule(
    'reclaim-vac-cleanup',
    '*/5 * * * *',
    $c$
    DO $d$
    DECLARE j record;
    BEGIN
      FOR j IN SELECT jobname FROM cron.job
               WHERE jobname LIKE 'reclaim-vac-%'
                 AND jobname <> 'reclaim-vac-cleanup'
      LOOP
        PERFORM cron.unschedule(j.jobname);
      END LOOP;
      PERFORM cron.unschedule('reclaim-vac-cleanup');
    END
    $d$;
    $c$
  );

  RETURN jsonb_build_object(
    'scheduled', v_scheduled,
    'scheduled_count', array_length(v_scheduled, 1),
    'db_bytes_before', v_before_bytes,
    'message', 'VACUUM FULL planlagt hvert minutt de neste 5 minuttene, deretter auto-rydding.'
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.reclaim_space() TO authenticated, service_role;
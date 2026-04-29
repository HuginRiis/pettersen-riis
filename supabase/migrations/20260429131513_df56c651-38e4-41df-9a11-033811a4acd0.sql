CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snapshot-tibber-daily') THEN
    PERFORM cron.unschedule('snapshot-tibber-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'snapshot-tibber-daily',
  '*/2 * * * *',
  $$
  INSERT INTO public.tibber_daily_kwh (location, day, kwh, cost, source)
  SELECT
    location,
    (recorded_at AT TIME ZONE 'Europe/Oslo')::date AS day,
    ROUND(MAX(kwh_today)::numeric, 3) AS kwh,
    NULL::numeric AS cost,
    'pulse-max-cron' AS source
  FROM public.pulse_readings
  WHERE recorded_at >= now() - interval '4 days'
    AND location IN ('tollnes', 'hytta')
    AND kwh_today IS NOT NULL
  GROUP BY location, (recorded_at AT TIME ZONE 'Europe/Oslo')::date
  HAVING MAX(kwh_today) > 0
  ON CONFLICT (location, day) DO UPDATE SET
    kwh = GREATEST(public.tibber_daily_kwh.kwh, EXCLUDED.kwh),
    cost = COALESCE(EXCLUDED.cost, public.tibber_daily_kwh.cost),
    source = EXCLUDED.source,
    updated_at = now();
  $$
);
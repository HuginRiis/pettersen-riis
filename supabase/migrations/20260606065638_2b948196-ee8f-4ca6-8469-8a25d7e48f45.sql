
CREATE TABLE IF NOT EXISTS public.air_quality_history (
  location_key text NOT NULL,
  ts timestamptz NOT NULL,
  pm10 numeric, pm25 numeric,
  no2 numeric, o3 numeric, so2 numeric, co numeric,
  european_aqi numeric,
  temperature numeric, humidity numeric, precipitation numeric, wind_speed numeric,
  PRIMARY KEY (location_key, ts)
);
CREATE INDEX IF NOT EXISTS air_quality_history_ts_idx ON public.air_quality_history (location_key, ts DESC);

GRANT SELECT ON public.air_quality_history TO anon, authenticated;
GRANT ALL ON public.air_quality_history TO service_role;
ALTER TABLE public.air_quality_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view aq history" ON public.air_quality_history FOR SELECT USING (true);

-- Daily cron at 04:15 UTC to append yesterday's hourly data
SELECT cron.schedule(
  'air-quality-history-daily',
  '15 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pettersen-riis.lovable.app/api/public/hooks/air-quality-history-daily',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlZmdueG9sbm9keHNtZmt0bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTM5MjksImV4cCI6MjA5MTk2OTkyOX0.MfI7Y6xfM_eSayT24ezIiwRd9w1gZLPXlPxX3-39KLE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);


CREATE TABLE public.homey_sensor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  device_id text NOT NULL,
  device_name text,
  zone text,
  kind text NOT NULL,
  capability_id text NOT NULL,
  event_type text NOT NULL,
  value text
);
CREATE INDEX idx_hse_ts ON public.homey_sensor_events (ts DESC);
CREATE INDEX idx_hse_kind_ts ON public.homey_sensor_events (kind, ts DESC);
CREATE INDEX idx_hse_dev_ts ON public.homey_sensor_events (device_id, ts DESC);

ALTER TABLE public.homey_sensor_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view homey sensor events" ON public.homey_sensor_events FOR SELECT USING (true);
CREATE POLICY "Anyone can insert homey sensor events" ON public.homey_sensor_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete homey sensor events" ON public.homey_sensor_events FOR DELETE USING (true);

CREATE TABLE public.homey_sensor_state (
  device_id text NOT NULL,
  capability_id text NOT NULL,
  device_name text,
  zone text,
  kind text NOT NULL,
  last_value text,
  last_ts timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, capability_id)
);
ALTER TABLE public.homey_sensor_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view homey sensor state" ON public.homey_sensor_state FOR SELECT USING (true);
CREATE POLICY "Anyone can insert homey sensor state" ON public.homey_sensor_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update homey sensor state" ON public.homey_sensor_state FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete homey sensor state" ON public.homey_sensor_state FOR DELETE USING (true);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'homey-sensor-poll-every-min',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://project--dc80f3f8-2238-416c-97d8-0564a088e7cb.lovable.app/api/public/hooks/homey-sensor-poll',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);

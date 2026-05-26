CREATE TABLE public.device_power_samples (
  device_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  watts NUMERIC NOT NULL,
  PRIMARY KEY (device_id, ts)
);

GRANT SELECT ON public.device_power_samples TO authenticated, anon;
GRANT ALL ON public.device_power_samples TO service_role;

ALTER TABLE public.device_power_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_power_samples readable by all"
  ON public.device_power_samples FOR SELECT
  USING (true);

CREATE INDEX idx_device_power_samples_device_ts
  ON public.device_power_samples (device_id, ts DESC);
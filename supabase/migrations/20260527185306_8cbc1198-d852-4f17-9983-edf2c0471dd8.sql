CREATE TABLE public.basseng_climate_samples (
  ts timestamptz NOT NULL DEFAULT now(),
  pool_temp numeric,
  outdoor_temp numeric,
  watts numeric,
  PRIMARY KEY (ts)
);

CREATE INDEX idx_basseng_climate_samples_ts ON public.basseng_climate_samples (ts DESC);

GRANT SELECT ON public.basseng_climate_samples TO anon, authenticated;
GRANT ALL ON public.basseng_climate_samples TO service_role;

ALTER TABLE public.basseng_climate_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "basseng climate samples readable by all"
  ON public.basseng_climate_samples FOR SELECT
  USING (true);

CREATE POLICY "basseng climate samples insertable by all"
  ON public.basseng_climate_samples FOR INSERT
  WITH CHECK (true);
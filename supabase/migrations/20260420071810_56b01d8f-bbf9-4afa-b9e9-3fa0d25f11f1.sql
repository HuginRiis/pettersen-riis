CREATE TABLE public.pulse_readings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location text NOT NULL CHECK (location IN ('hytta','tollnes')),
  watt double precision,
  kwh_today double precision,
  device_name text,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_pulse_readings_loc_time ON public.pulse_readings (location, recorded_at DESC);

ALTER TABLE public.pulse_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pulse readings"
ON public.pulse_readings FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert pulse readings"
ON public.pulse_readings FOR INSERT
WITH CHECK (true);
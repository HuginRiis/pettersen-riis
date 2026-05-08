ALTER TABLE public.garmin_daily_stats
  ADD COLUMN IF NOT EXISTS average_heart_rate INTEGER,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5,2);
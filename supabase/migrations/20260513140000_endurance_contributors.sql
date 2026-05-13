ALTER TABLE public.garmin_daily_stats
  ADD COLUMN IF NOT EXISTS endurance_contributors jsonb;

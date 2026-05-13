ALTER TABLE public.garmin_daily_stats
  ADD COLUMN IF NOT EXISTS vo2max_running numeric,
  ADD COLUMN IF NOT EXISTS vo2max_cycling numeric,
  ADD COLUMN IF NOT EXISTS endurance_score numeric,
  ADD COLUMN IF NOT EXISTS fitness_age numeric,
  ADD COLUMN IF NOT EXISTS training_status text,
  ADD COLUMN IF NOT EXISTS training_load_focus jsonb;
ALTER TABLE public.api_pause_flags
  ADD COLUMN IF NOT EXISTS window_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS end_time time NOT NULL DEFAULT '06:00';
ALTER TABLE public.garmin_notification_prefs
  ADD COLUMN IF NOT EXISTS notify_compare boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compare_time time without time zone NOT NULL DEFAULT '20:00:00',
  ADD COLUMN IF NOT EXISTS daily_show_both boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_fields text[] NOT NULL DEFAULT ARRAY['steps','sleep','rhr','calories']::text[];
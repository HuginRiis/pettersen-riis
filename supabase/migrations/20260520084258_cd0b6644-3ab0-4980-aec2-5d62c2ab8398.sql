
ALTER TABLE public.garmin_notification_prefs
  ADD COLUMN IF NOT EXISTS notify_no_sync boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_sync_hours integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS no_sync_check_time time NOT NULL DEFAULT '10:00:00';

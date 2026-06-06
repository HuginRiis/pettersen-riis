
ALTER TABLE public.uv_notification_prefs
  ADD COLUMN IF NOT EXISTS notify_peak_clear boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_peak_cloud boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_peak_clear_date date,
  ADD COLUMN IF NOT EXISTS notified_peak_cloud_date date;

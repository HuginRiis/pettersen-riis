ALTER TABLE public.uv_notification_prefs
  ADD COLUMN IF NOT EXISTS notify_fall_3 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_fall_6 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_fall_8 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_fall_date_3 date,
  ADD COLUMN IF NOT EXISTS notified_fall_date_6 date,
  ADD COLUMN IF NOT EXISTS notified_fall_date_8 date;
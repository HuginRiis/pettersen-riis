ALTER TABLE public.uv_notification_prefs
  ADD COLUMN IF NOT EXISTS notify_rise_3 boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_rise_6 boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_rise_8 boolean NOT NULL DEFAULT true;
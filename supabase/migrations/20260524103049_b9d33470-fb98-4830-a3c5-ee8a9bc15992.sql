
ALTER TABLE public.uv_notification_prefs
  ADD COLUMN IF NOT EXISTS fall_recipient text NOT NULL DEFAULT 'Alle',
  ADD COLUMN IF NOT EXISTS reached_date_3 date,
  ADD COLUMN IF NOT EXISTS reached_date_6 date,
  ADD COLUMN IF NOT EXISTS reached_date_8 date;

UPDATE public.uv_notification_prefs SET fall_recipient = recipient WHERE fall_recipient = 'Alle';

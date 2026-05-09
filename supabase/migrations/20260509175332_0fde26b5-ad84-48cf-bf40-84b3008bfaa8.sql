ALTER TABLE public.garmin_notification_prefs
  ADD COLUMN IF NOT EXISTS garmin_owner text NOT NULL DEFAULT 'arne'
  CHECK (garmin_owner IN ('arne','rebekka'));
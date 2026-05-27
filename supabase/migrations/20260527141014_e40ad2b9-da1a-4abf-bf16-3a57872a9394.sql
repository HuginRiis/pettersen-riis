ALTER TABLE public.basseng_notification_prefs
  ADD COLUMN IF NOT EXISTS trigger_mode text NOT NULL DEFAULT 'delta',
  ADD COLUMN IF NOT EXISTS interval_hours integer NOT NULL DEFAULT 2;

ALTER TABLE public.basseng_notification_prefs
  DROP CONSTRAINT IF EXISTS basseng_trigger_mode_check;
ALTER TABLE public.basseng_notification_prefs
  ADD CONSTRAINT basseng_trigger_mode_check CHECK (trigger_mode IN ('delta','interval'));

ALTER TABLE public.basseng_notification_prefs
  DROP CONSTRAINT IF EXISTS basseng_interval_hours_check;
ALTER TABLE public.basseng_notification_prefs
  ADD CONSTRAINT basseng_interval_hours_check CHECK (interval_hours BETWEEN 1 AND 6);
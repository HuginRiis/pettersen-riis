ALTER TABLE public.light_idle_notification_prefs
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'zone';

-- Tillat tomme zone-felter for global-regler
ALTER TABLE public.light_idle_notification_prefs
  ALTER COLUMN homey_zone_id DROP NOT NULL,
  ALTER COLUMN zone_name DROP NOT NULL,
  ALTER COLUMN lights_on_minutes DROP NOT NULL;
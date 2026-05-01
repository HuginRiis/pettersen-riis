ALTER TABLE public.uv_notification_prefs
ADD COLUMN IF NOT EXISTS lead_minutes integer NOT NULL DEFAULT 30
CHECK (lead_minutes IN (0, 30, 60));
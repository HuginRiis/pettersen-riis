
-- Globale innstillinger for push-varslinger (klokkeslett, av/på)
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view notification settings"
  ON public.notification_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert notification settings"
  ON public.notification_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update notification settings"
  ON public.notification_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete notification settings"
  ON public.notification_settings FOR DELETE USING (true);

-- Logg for tibber "manglende data"-varsler (én per dag per location)
CREATE TABLE IF NOT EXISTS public.tibber_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notified_for_date date NOT NULL,
  location text NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notified_for_date, location)
);

ALTER TABLE public.tibber_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tibber notif log"
  ON public.tibber_notification_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert tibber notif log"
  ON public.tibber_notification_log FOR INSERT WITH CHECK (true);

-- Default-rader
INSERT INTO public.notification_settings (key, value) VALUES
  ('birthday_time', '{"hour": 8, "minute": 0}'::jsonb),
  ('tibber_missing', '{"enabled": false, "hour": 9, "minute": 0, "recipient": "Alle"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

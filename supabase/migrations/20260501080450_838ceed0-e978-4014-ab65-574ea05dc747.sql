CREATE TABLE public.weather_notification_prefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location TEXT NOT NULL,
  label TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  kind TEXT NOT NULL,
  threshold DOUBLE PRECISION,
  recipient TEXT NOT NULL DEFAULT 'Alle',
  days_ahead INTEGER NOT NULL DEFAULT 1,
  notify_hour INTEGER NOT NULL DEFAULT 7,
  notify_minute INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_notified_date DATE,
  last_notified_signature TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.weather_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view weather prefs" ON public.weather_notification_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert weather prefs" ON public.weather_notification_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update weather prefs" ON public.weather_notification_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete weather prefs" ON public.weather_notification_prefs FOR DELETE USING (true);

CREATE TRIGGER weather_notification_prefs_updated_at
BEFORE UPDATE ON public.weather_notification_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_weather_prefs_enabled ON public.weather_notification_prefs(enabled, notify_hour, notify_minute);
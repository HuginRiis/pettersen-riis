CREATE TABLE public.uv_notification_prefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  recipient TEXT NOT NULL DEFAULT 'Alle',
  notified_date_3 DATE,
  notified_date_6 DATE,
  notified_date_8 DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.uv_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view uv prefs" ON public.uv_notification_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert uv prefs" ON public.uv_notification_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update uv prefs" ON public.uv_notification_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete uv prefs" ON public.uv_notification_prefs FOR DELETE USING (true);

CREATE TRIGGER uv_prefs_updated_at
  BEFORE UPDATE ON public.uv_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.uv_notification_prefs (location, label, lat, lon, recipient) VALUES
  ('borgen', 'Borgen · Tollnes', 59.1789, 9.5732, 'Alle'),
  ('hytta', 'Hytta · Flesberg', 59.8733, 9.4297, 'Alle')
ON CONFLICT (location) DO NOTHING;
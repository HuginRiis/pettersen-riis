
CREATE TABLE IF NOT EXISTS public.climate_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_key text NOT NULL UNIQUE CHECK (room_key IN ('stua','soverommet','hytta-stua')),
  station_match text NOT NULL,
  module_match text,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  notify_hot boolean NOT NULL DEFAULT true,
  hot_threshold numeric NOT NULL DEFAULT 25,
  notify_cold boolean NOT NULL DEFAULT true,
  cold_threshold numeric NOT NULL DEFAULT 18,
  recipient text NOT NULL DEFAULT 'Alle',
  cooldown_minutes integer NOT NULL DEFAULT 60,
  last_notified_hot_at timestamptz,
  last_notified_cold_at timestamptz,
  last_value numeric,
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.climate_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view climate prefs" ON public.climate_notification_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert climate prefs" ON public.climate_notification_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update climate prefs" ON public.climate_notification_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete climate prefs" ON public.climate_notification_prefs FOR DELETE USING (true);

CREATE TRIGGER trg_climate_prefs_updated_at
BEFORE UPDATE ON public.climate_notification_prefs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.climate_notification_prefs
  (room_key, station_match, module_match, label, hot_threshold, cold_threshold)
VALUES
  ('stua',        'tollnes', NULL,        'Borgen · Stua',        25, 18),
  ('soverommet',  'tollnes', 'soverom',   'Borgen · Soverommet',  23, 16),
  ('hytta-stua',  'hytta',   NULL,        'Hytta · Stua',         25, 10)
ON CONFLICT (room_key) DO NOTHING;

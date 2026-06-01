-- 1) UV: velg om sjekk skal bruke skyfri eller faktisk UV (med skydekke)
ALTER TABLE public.uv_notification_prefs
  ADD COLUMN IF NOT EXISTS uv_source text NOT NULL DEFAULT 'clear_sky'
    CHECK (uv_source IN ('clear_sky', 'with_clouds'));

-- 2) Luftkvalitet-varsler per lokasjon
CREATE TABLE IF NOT EXISTS public.air_quality_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL UNIQUE,
  label text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  recipient text NOT NULL DEFAULT 'Alle',
  cooldown_minutes integer NOT NULL DEFAULT 180,

  notify_aqi boolean NOT NULL DEFAULT true,
  aqi_threshold integer NOT NULL DEFAULT 60,   -- EU AQI: 60 = "moderat" -> "dårlig"
  notify_pm25 boolean NOT NULL DEFAULT true,
  pm25_threshold numeric NOT NULL DEFAULT 25,  -- WHO 24t
  notify_pm10 boolean NOT NULL DEFAULT true,
  pm10_threshold numeric NOT NULL DEFAULT 50,
  notify_no2 boolean NOT NULL DEFAULT false,
  no2_threshold numeric NOT NULL DEFAULT 50,
  notify_o3 boolean NOT NULL DEFAULT false,
  o3_threshold numeric NOT NULL DEFAULT 120,
  notify_so2 boolean NOT NULL DEFAULT false,
  so2_threshold numeric NOT NULL DEFAULT 100,
  notify_dust boolean NOT NULL DEFAULT false,
  dust_threshold numeric NOT NULL DEFAULT 200,

  last_notified_aqi_at timestamptz,
  last_notified_pm25_at timestamptz,
  last_notified_pm10_at timestamptz,
  last_notified_no2_at timestamptz,
  last_notified_o3_at timestamptz,
  last_notified_so2_at timestamptz,
  last_notified_dust_at timestamptz,
  last_checked_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_quality_notification_prefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.air_quality_notification_prefs TO anon;
GRANT ALL ON public.air_quality_notification_prefs TO service_role;

ALTER TABLE public.air_quality_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view air quality prefs"
  ON public.air_quality_notification_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert air quality prefs"
  ON public.air_quality_notification_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update air quality prefs"
  ON public.air_quality_notification_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete air quality prefs"
  ON public.air_quality_notification_prefs FOR DELETE USING (true);

DROP TRIGGER IF EXISTS trg_air_quality_prefs_updated_at ON public.air_quality_notification_prefs;
CREATE TRIGGER trg_air_quality_prefs_updated_at
  BEFORE UPDATE ON public.air_quality_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default locations (samme som UV)
INSERT INTO public.air_quality_notification_prefs (location, label, lat, lon)
VALUES
  ('borgen', 'Borgen · Tollnes', 59.20, 9.62),
  ('hytta', 'Hytta · Lyngdal i Numedal', 59.91, 9.07)
ON CONFLICT (location) DO NOTHING;
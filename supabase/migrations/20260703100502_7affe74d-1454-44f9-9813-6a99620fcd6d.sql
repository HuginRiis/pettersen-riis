
CREATE TABLE public.weather_summary_push_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  who text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  slot1_enabled boolean NOT NULL DEFAULT true,
  slot1_hour int NOT NULL DEFAULT 6,
  slot1_minute int NOT NULL DEFAULT 30,
  slot1_target text NOT NULL DEFAULT 'today',
  slot2_enabled boolean NOT NULL DEFAULT true,
  slot2_hour int NOT NULL DEFAULT 17,
  slot2_minute int NOT NULL DEFAULT 0,
  slot2_target text NOT NULL DEFAULT 'tomorrow',
  include_symbol boolean NOT NULL DEFAULT true,
  include_temp_range boolean NOT NULL DEFAULT true,
  include_precip boolean NOT NULL DEFAULT true,
  include_wind boolean NOT NULL DEFAULT true,
  include_sunrise_sunset boolean NOT NULL DEFAULT true,
  include_uv boolean NOT NULL DEFAULT false,
  include_summary boolean NOT NULL DEFAULT true,
  last_sent_slot1_date date,
  last_sent_slot2_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weather_summary_slot1_target_chk CHECK (slot1_target IN ('today','tomorrow')),
  CONSTRAINT weather_summary_slot2_target_chk CHECK (slot2_target IN ('today','tomorrow'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_summary_push_prefs TO authenticated;
GRANT ALL ON public.weather_summary_push_prefs TO service_role;

ALTER TABLE public.weather_summary_push_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view weather summary prefs"
  ON public.weather_summary_push_prefs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert weather summary prefs"
  ON public.weather_summary_push_prefs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update weather summary prefs"
  ON public.weather_summary_push_prefs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete weather summary prefs"
  ON public.weather_summary_push_prefs FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_weather_summary_push_prefs_updated_at
  BEFORE UPDATE ON public.weather_summary_push_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

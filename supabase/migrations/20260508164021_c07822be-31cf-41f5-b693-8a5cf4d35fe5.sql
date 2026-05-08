CREATE TABLE public.garmin_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oauth1_token text,
  oauth1_secret text,
  oauth2_token text,
  oauth2_refresh_token text,
  oauth2_expires_at timestamptz,
  domain text NOT NULL DEFAULT 'garmin.com',
  username text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.garmin_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.garmin_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  steps integer,
  step_goal integer,
  floors_climbed numeric,
  floors_goal numeric,
  resting_heart_rate integer,
  total_kilocalories integer,
  active_kilocalories integer,
  distance_meters integer,
  moderate_intensity_minutes integer,
  vigorous_intensity_minutes integer,
  intensity_minutes_goal integer,
  body_battery_high integer,
  body_battery_low integer,
  stress_average integer,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.garmin_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE INDEX garmin_daily_stats_day_idx ON public.garmin_daily_stats (day DESC);
CREATE POLICY "Anyone can view garmin daily" ON public.garmin_daily_stats FOR SELECT USING (true);
CREATE POLICY "Anyone can insert garmin daily" ON public.garmin_daily_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update garmin daily" ON public.garmin_daily_stats FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete garmin daily" ON public.garmin_daily_stats FOR DELETE USING (true);

CREATE TABLE public.garmin_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garmin_activity_id bigint NOT NULL UNIQUE,
  activity_type text,
  activity_name text,
  start_time_local timestamptz NOT NULL,
  duration_seconds numeric,
  distance_meters numeric,
  calories integer,
  average_hr integer,
  max_hr integer,
  elevation_gain numeric,
  average_speed numeric,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.garmin_activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX garmin_activities_start_idx ON public.garmin_activities (start_time_local DESC);
CREATE POLICY "Anyone can view garmin activities" ON public.garmin_activities FOR SELECT USING (true);
CREATE POLICY "Anyone can insert garmin activities" ON public.garmin_activities FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update garmin activities" ON public.garmin_activities FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete garmin activities" ON public.garmin_activities FOR DELETE USING (true);

CREATE TABLE public.garmin_sleep (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  sleep_start timestamptz,
  sleep_end timestamptz,
  total_seconds integer,
  deep_seconds integer,
  light_seconds integer,
  rem_seconds integer,
  awake_seconds integer,
  average_spo2 numeric,
  average_respiration numeric,
  sleep_score integer,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.garmin_sleep ENABLE ROW LEVEL SECURITY;
CREATE INDEX garmin_sleep_day_idx ON public.garmin_sleep (day DESC);
CREATE POLICY "Anyone can view garmin sleep" ON public.garmin_sleep FOR SELECT USING (true);
CREATE POLICY "Anyone can insert garmin sleep" ON public.garmin_sleep FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update garmin sleep" ON public.garmin_sleep FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete garmin sleep" ON public.garmin_sleep FOR DELETE USING (true);

CREATE TABLE public.garmin_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  trigger text NOT NULL,
  ok boolean NOT NULL,
  daily_count integer DEFAULT 0,
  activities_count integer DEFAULT 0,
  sleep_count integer DEFAULT 0,
  duration_ms integer,
  error text
);
ALTER TABLE public.garmin_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view garmin sync log" ON public.garmin_sync_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert garmin sync log" ON public.garmin_sync_log FOR INSERT WITH CHECK (true);

CREATE TRIGGER garmin_tokens_updated_at BEFORE UPDATE ON public.garmin_tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER garmin_daily_stats_updated_at BEFORE UPDATE ON public.garmin_daily_stats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER garmin_activities_updated_at BEFORE UPDATE ON public.garmin_activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER garmin_sleep_updated_at BEFORE UPDATE ON public.garmin_sleep FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
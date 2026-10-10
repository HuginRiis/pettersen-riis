-- Fyller hull: tabeller/kolonner som finnes i Lovable Cloud (types.ts) men ikke i migrasjonene.
CREATE TABLE IF NOT EXISTS public.climate_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  room_key text NOT NULL,
  station_match text NOT NULL,
  module_match text,
  recipient text NOT NULL DEFAULT 'alle',
  enabled boolean NOT NULL DEFAULT true,
  notify_hot boolean NOT NULL DEFAULT true,
  notify_cold boolean NOT NULL DEFAULT true,
  hot_threshold numeric NOT NULL DEFAULT 26,
  cold_threshold numeric NOT NULL DEFAULT 17,
  cooldown_minutes integer NOT NULL DEFAULT 180,
  last_value numeric,
  last_checked_at timestamptz,
  last_notified_hot_at timestamptz,
  last_notified_cold_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.gardena_auth (
  id bigserial PRIMARY KEY,
  user_id text,
  access_token text,
  refresh_token text,
  token_type text,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.push_quiet_hours (
  recipient text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  weekday_start time NOT NULL DEFAULT '22:00',
  weekday_end time NOT NULL DEFAULT '07:00',
  weekend_start time NOT NULL DEFAULT '23:00',
  weekend_end time NOT NULL DEFAULT '09:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['climate_notification_prefs','gardena_auth','push_quiet_hours'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY "anyone can read %1$s" ON public.%1$I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "anyone can insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "anyone can update %1$s" ON public.%1$I FOR UPDATE USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "anyone can delete %1$s" ON public.%1$I FOR DELETE USING (true)', t);
  END LOOP;
END $$;
-- Tokens for Gardena skal bare leses av serveren.
DROP POLICY IF EXISTS "anyone can read gardena_auth" ON public.gardena_auth;
DROP POLICY IF EXISTS "anyone can insert gardena_auth" ON public.gardena_auth;
DROP POLICY IF EXISTS "anyone can update gardena_auth" ON public.gardena_auth;
DROP POLICY IF EXISTS "anyone can delete gardena_auth" ON public.gardena_auth;
REVOKE ALL ON public.gardena_auth FROM anon, authenticated;

ALTER TABLE public.garmin_devices ADD COLUMN IF NOT EXISTS image_transparent_url text;
ALTER TABLE public.garmin_tokens ADD COLUMN IF NOT EXISTS device_image_transparent_url text;

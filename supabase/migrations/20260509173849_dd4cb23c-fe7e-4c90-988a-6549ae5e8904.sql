
-- Add owner column to all garmin_* tables, default 'arne' (existing data), update unique constraints

-- 1. garmin_tokens: support multiple owners
ALTER TABLE public.garmin_tokens ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'arne';
CREATE UNIQUE INDEX IF NOT EXISTS garmin_tokens_owner_idx ON public.garmin_tokens(owner);

-- 2. garmin_daily_stats
ALTER TABLE public.garmin_daily_stats ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'arne';
-- Drop old unique on day if exists, add (owner, day)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='garmin_daily_stats' AND indexname='garmin_daily_stats_day_key') THEN
    ALTER TABLE public.garmin_daily_stats DROP CONSTRAINT IF EXISTS garmin_daily_stats_day_key;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS garmin_daily_stats_owner_day_idx ON public.garmin_daily_stats(owner, day);

-- 3. garmin_activities
ALTER TABLE public.garmin_activities ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'arne';
DO $$ BEGIN
  ALTER TABLE public.garmin_activities DROP CONSTRAINT IF EXISTS garmin_activities_garmin_activity_id_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS garmin_activities_owner_id_idx ON public.garmin_activities(owner, garmin_activity_id);

-- 4. garmin_sleep
ALTER TABLE public.garmin_sleep ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'arne';
DO $$ BEGIN
  ALTER TABLE public.garmin_sleep DROP CONSTRAINT IF EXISTS garmin_sleep_day_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS garmin_sleep_owner_day_idx ON public.garmin_sleep(owner, day);

-- 5. garmin_intraday
ALTER TABLE public.garmin_intraday ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'arne';
DO $$ BEGIN
  ALTER TABLE public.garmin_intraday DROP CONSTRAINT IF EXISTS garmin_intraday_day_hour_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS garmin_intraday_owner_day_hour_idx ON public.garmin_intraday(owner, day, hour);

-- 6. garmin_sync_log
ALTER TABLE public.garmin_sync_log ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'arne';

-- 7. RLS for garmin_intraday (was missing) and garmin_tokens stays admin-only
ALTER TABLE public.garmin_intraday ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone can view garmin intraday" ON public.garmin_intraday FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can insert garmin intraday" ON public.garmin_intraday FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can update garmin intraday" ON public.garmin_intraday FOR UPDATE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Anyone can delete garmin intraday" ON public.garmin_intraday FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

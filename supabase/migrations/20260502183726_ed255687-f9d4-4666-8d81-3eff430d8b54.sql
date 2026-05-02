ALTER TABLE public.homey_connections
  ADD COLUMN IF NOT EXISTS homey_id text,
  ADD COLUMN IF NOT EXISTS homey_name text,
  ADD COLUMN IF NOT EXISTS homey_base_url text,
  ADD COLUMN IF NOT EXISTS homey_target_cached_at timestamptz;
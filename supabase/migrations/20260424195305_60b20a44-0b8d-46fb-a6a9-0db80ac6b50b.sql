ALTER TABLE public.strava_connections
  ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'arne';

UPDATE public.strava_connections SET owner = 'arne' WHERE owner IS NULL OR owner = '';

CREATE UNIQUE INDEX IF NOT EXISTS strava_connections_owner_key
  ON public.strava_connections (owner);
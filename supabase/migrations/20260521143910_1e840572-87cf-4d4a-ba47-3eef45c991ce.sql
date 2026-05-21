CREATE TABLE IF NOT EXISTS public.strava_dashboard_cache (
  owner text PRIMARY KEY,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL
);
ALTER TABLE public.strava_dashboard_cache ENABLE ROW LEVEL SECURITY;
-- Ingen klient-tilgang – kun service role brukes fra server.
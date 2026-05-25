
CREATE TABLE IF NOT EXISTS public.netatmo_climate_snapshot (
  cache_key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.netatmo_climate_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "climate snapshot readable by all"
  ON public.netatmo_climate_snapshot
  FOR SELECT
  USING (true);

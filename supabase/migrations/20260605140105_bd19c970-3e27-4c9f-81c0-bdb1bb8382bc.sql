CREATE TABLE IF NOT EXISTS public.gardena_snapshot (
  cache_key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gardena_snapshot TO anon, authenticated;
GRANT ALL ON public.gardena_snapshot TO service_role;
ALTER TABLE public.gardena_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gardena snapshot readable by all" ON public.gardena_snapshot FOR SELECT USING (true);
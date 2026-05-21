
CREATE TABLE IF NOT EXISTS public.page_load_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loaded_at timestamptz NOT NULL DEFAULT now(),
  route text NOT NULL,
  who text NOT NULL DEFAULT 'anon',
  device text,
  os text,
  browser text,
  user_agent text,
  load_ms integer NOT NULL,
  ttfb_ms integer,
  dom_ms integer,
  kind text NOT NULL DEFAULT 'spa'
);

CREATE INDEX IF NOT EXISTS page_load_log_route_idx ON public.page_load_log (route, loaded_at DESC);
CREATE INDEX IF NOT EXISTS page_load_log_loaded_at_idx ON public.page_load_log (loaded_at DESC);

ALTER TABLE public.page_load_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert page load log"
  ON public.page_load_log FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can view page load log"
  ON public.page_load_log FOR SELECT TO public
  USING (true);

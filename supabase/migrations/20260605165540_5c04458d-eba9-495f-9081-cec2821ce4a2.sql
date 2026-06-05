
CREATE TABLE public.flights_seen (
  icao24 TEXT NOT NULL PRIMARY KEY,
  callsign TEXT,
  origin_country TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at TIMESTAMPTZ,
  last_notified_distance_km NUMERIC
);
CREATE INDEX flights_seen_last_seen_idx ON public.flights_seen (last_seen DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flights_seen TO authenticated;
GRANT ALL ON public.flights_seen TO service_role;
ALTER TABLE public.flights_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view flights_seen" ON public.flights_seen FOR SELECT USING (true);
CREATE POLICY "Anyone can insert flights_seen" ON public.flights_seen FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update flights_seen" ON public.flights_seen FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete flights_seen" ON public.flights_seen FOR DELETE USING (true);

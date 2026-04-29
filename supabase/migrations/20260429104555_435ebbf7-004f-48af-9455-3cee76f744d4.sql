CREATE TABLE public.tibber_daily_kwh (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL,
  day date NOT NULL,
  kwh numeric NOT NULL DEFAULT 0,
  cost numeric,
  source text NOT NULL DEFAULT 'tibber-snapshot',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location, day)
);

CREATE INDEX tibber_daily_kwh_location_day_idx ON public.tibber_daily_kwh (location, day DESC);

ALTER TABLE public.tibber_daily_kwh ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tibber daily kwh"
  ON public.tibber_daily_kwh FOR SELECT USING (true);

CREATE POLICY "Anyone can insert tibber daily kwh"
  ON public.tibber_daily_kwh FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update tibber daily kwh"
  ON public.tibber_daily_kwh FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER set_tibber_daily_kwh_updated_at
  BEFORE UPDATE ON public.tibber_daily_kwh
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
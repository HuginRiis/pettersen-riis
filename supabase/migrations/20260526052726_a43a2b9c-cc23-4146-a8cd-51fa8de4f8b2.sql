
CREATE TABLE public.jaguar_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL DEFAULT false,
  error text,
  level numeric,
  range_km numeric,
  odometer_km numeric,
  locked boolean,
  position_lat numeric,
  position_lon numeric,
  raw jsonb
);

CREATE INDEX idx_jaguar_snapshots_fetched_at ON public.jaguar_snapshots (fetched_at DESC);

ALTER TABLE public.jaguar_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read jaguar snapshots"
ON public.jaguar_snapshots FOR SELECT
TO authenticated
USING (true);

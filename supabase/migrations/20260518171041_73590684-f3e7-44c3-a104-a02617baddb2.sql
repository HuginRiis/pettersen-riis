
CREATE TABLE IF NOT EXISTS public.network_snapshots (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  device_id text NOT NULL,
  device_name text,
  kind text NOT NULL CHECK (kind IN ('router','client','other')),
  available boolean NOT NULL DEFAULT true,
  signal numeric,
  watt numeric,
  zone text,
  raw jsonb
);
CREATE INDEX IF NOT EXISTS network_snapshots_ts_idx ON public.network_snapshots (ts DESC);
CREATE INDEX IF NOT EXISTS network_snapshots_device_idx ON public.network_snapshots (device_id, ts DESC);
ALTER TABLE public.network_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read network snapshots" ON public.network_snapshots FOR SELECT USING (true);

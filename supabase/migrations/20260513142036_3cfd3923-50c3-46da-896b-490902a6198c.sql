
CREATE TABLE IF NOT EXISTS public.garmin_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner TEXT NOT NULL DEFAULT 'arne',
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  register_date TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner, product_id)
);

CREATE INDEX IF NOT EXISTS idx_garmin_devices_owner ON public.garmin_devices(owner);

ALTER TABLE public.garmin_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view garmin devices" ON public.garmin_devices FOR SELECT USING (true);
CREATE POLICY "Anyone can insert garmin devices" ON public.garmin_devices FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update garmin devices" ON public.garmin_devices FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete garmin devices" ON public.garmin_devices FOR DELETE USING (true);

CREATE TRIGGER update_garmin_devices_updated_at
BEFORE UPDATE ON public.garmin_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

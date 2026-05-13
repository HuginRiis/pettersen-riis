ALTER TABLE public.garmin_tokens
  ADD COLUMN IF NOT EXISTS device_name TEXT,
  ADD COLUMN IF NOT EXISTS device_product_id TEXT,
  ADD COLUMN IF NOT EXISTS device_image_url TEXT,
  ADD COLUMN IF NOT EXISTS device_updated_at TIMESTAMPTZ;
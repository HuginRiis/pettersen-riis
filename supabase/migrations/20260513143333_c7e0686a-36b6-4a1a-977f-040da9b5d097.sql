alter table public.garmin_devices add column if not exists image_transparent_url text;
alter table public.garmin_tokens add column if not exists device_image_transparent_url text;
-- Remove duplicates keeping the oldest id
DELETE FROM public.homey_sensor_events a
USING public.homey_sensor_events b
WHERE a.ctid > b.ctid
  AND a.device_id = b.device_id
  AND a.ts = b.ts
  AND a.event_type = b.event_type;

-- Add unique constraint to prevent future duplicates
ALTER TABLE public.homey_sensor_events
  ADD CONSTRAINT homey_sensor_events_dedup_uk
  UNIQUE (device_id, ts, event_type);
ALTER TABLE public.flights_seen ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'tollnes';
ALTER TABLE public.flights_seen DROP CONSTRAINT IF EXISTS flights_seen_pkey;
ALTER TABLE public.flights_seen ADD CONSTRAINT flights_seen_pkey PRIMARY KEY (location, icao24);
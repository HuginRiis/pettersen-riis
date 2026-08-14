CREATE TABLE public.car_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle text NOT NULL DEFAULT 'jaguar',
  start_ts timestamptz NOT NULL,
  end_ts timestamptz,
  start_place text,
  start_lat double precision,
  start_lon double precision,
  end_place text,
  end_lat double precision,
  end_lon double precision,
  duration_min integer,
  distance_km double precision NOT NULL DEFAULT 0,
  avg_speed_kmh double precision,
  energy_regen_kwh double precision,
  efficiency_kwh_100km double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX car_trips_dedup_idx ON public.car_trips (vehicle, start_ts, distance_km);
CREATE INDEX car_trips_start_idx ON public.car_trips (start_ts DESC);

GRANT ALL ON public.car_trips TO service_role;

ALTER TABLE public.car_trips ENABLE ROW LEVEL SECURITY;
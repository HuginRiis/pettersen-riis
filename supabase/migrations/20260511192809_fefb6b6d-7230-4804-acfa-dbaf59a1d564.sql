ALTER TABLE public.garmin_intraday DROP CONSTRAINT garmin_intraday_pkey;
ALTER TABLE public.garmin_intraday ADD PRIMARY KEY (owner, day, hour);
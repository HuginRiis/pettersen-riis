CREATE OR REPLACE FUNCTION public.pulse_monthly_peaks()
RETURNS TABLE(location text, month text, hour_start timestamptz, kwh double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  with h as (
    select p.location::text loc, date_trunc('hour', p.recorded_at at time zone 'Europe/Oslo') hr,
           avg(p.watt)/1000.0 kwh
    from pulse_readings p
    where p.watt is not null and p.recorded_at > now() - interval '200 days'
    group by 1,2 having count(*) >= 10
  ), d as (
    select distinct on (loc, hr::date) * from h order by loc, hr::date, kwh desc
  ), r as (
    select *, row_number() over (partition by loc, to_char(hr,'YYYY-MM') order by kwh desc) rn from d
  )
  select loc, to_char(hr,'YYYY-MM'), (hr at time zone 'Europe/Oslo'), kwh from r where rn <= 3
$$;
REVOKE ALL ON FUNCTION public.pulse_monthly_peaks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pulse_monthly_peaks() TO service_role;
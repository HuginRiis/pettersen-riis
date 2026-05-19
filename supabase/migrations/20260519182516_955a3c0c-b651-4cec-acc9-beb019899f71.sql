create table if not exists public.flight_alert_prefs (
  id uuid primary key default gen_random_uuid(),
  airports text[] not null default '{}',
  notify_arrivals boolean not null default true,
  notify_departures boolean not null default true,
  radius_center_lat numeric,
  radius_center_lon numeric,
  radius_km integer not null default 25,
  notify_radius boolean not null default false,
  min_altitude_m integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.flight_alert_prefs enable row level security;

create policy "flight_alert_prefs read all"
on public.flight_alert_prefs for select
using (true);

create policy "flight_alert_prefs insert all"
on public.flight_alert_prefs for insert
with check (true);

create policy "flight_alert_prefs update all"
on public.flight_alert_prefs for update
using (true);

create trigger flight_alert_prefs_updated_at
before update on public.flight_alert_prefs
for each row execute function public.set_updated_at();

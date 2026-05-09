create table if not exists public.garmin_intraday (
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  heart_rate_avg smallint,
  heart_rate_max smallint,
  stress_avg smallint,
  body_battery smallint,
  updated_at timestamptz not null default now(),
  primary key (day, hour)
);
alter table public.garmin_intraday enable row level security;
create index if not exists garmin_intraday_day_idx on public.garmin_intraday(day);
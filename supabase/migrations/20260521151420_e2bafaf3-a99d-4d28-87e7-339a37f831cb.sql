create table if not exists public.api_blackout_window (
  id smallint primary key default 1,
  enabled boolean not null default false,
  start_time time not null default '00:00',
  end_time time not null default '06:00',
  updated_at timestamptz not null default now(),
  constraint api_blackout_window_singleton check (id = 1)
);

alter table public.api_blackout_window enable row level security;

insert into public.api_blackout_window (id, enabled, start_time, end_time)
values (1, false, '00:00', '06:00')
on conflict (id) do nothing;

create table public.garmin_notification_prefs (
  id uuid primary key default gen_random_uuid(),
  recipient text not null default 'Alle',
  sender_label text not null default 'Garmin',
  enabled boolean not null default true,
  notify_daily boolean not null default true,
  daily_time time not null default '07:30',
  notify_step_goal boolean not null default false,
  notify_low_sleep boolean not null default false,
  low_sleep_hours numeric(3,1) not null default 6.0,
  notify_high_resting_hr boolean not null default false,
  high_rhr_bpm integer not null default 65,
  notified_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.garmin_notification_prefs enable row level security;

create policy "garmin_prefs_read_all"
  on public.garmin_notification_prefs for select
  using (true);

create policy "garmin_prefs_insert_all"
  on public.garmin_notification_prefs for insert
  with check (true);

create policy "garmin_prefs_update_all"
  on public.garmin_notification_prefs for update
  using (true);

create policy "garmin_prefs_delete_all"
  on public.garmin_notification_prefs for delete
  using (true);

create trigger garmin_notification_prefs_updated_at
  before update on public.garmin_notification_prefs
  for each row execute function public.set_updated_at();

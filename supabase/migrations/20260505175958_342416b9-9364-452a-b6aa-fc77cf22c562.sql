ALTER TABLE public.birthdays
  ADD COLUMN IF NOT EXISTS notify_days_before integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notify_hour integer,
  ADD COLUMN IF NOT EXISTS notify_minute integer,
  ADD COLUMN IF NOT EXISTS notified_date date;
CREATE TABLE public.push_quiet_hours (
  recipient text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  weekday_start time NOT NULL DEFAULT '22:00',
  weekday_end time NOT NULL DEFAULT '07:00',
  weekend_start time NOT NULL DEFAULT '23:00',
  weekend_end time NOT NULL DEFAULT '09:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_quiet_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can read quiet hours"
  ON public.push_quiet_hours FOR SELECT
  USING (true);

CREATE TRIGGER set_push_quiet_hours_updated_at
  BEFORE UPDATE ON public.push_quiet_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
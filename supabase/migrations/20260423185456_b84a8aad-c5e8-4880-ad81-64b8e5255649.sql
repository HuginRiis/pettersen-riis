CREATE TABLE public.home_alarm_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  who text NOT NULL DEFAULT 'Alle',
  source text NOT NULL DEFAULT 'borgen-app',
  note text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_alarm_log_changed_at ON public.home_alarm_log (changed_at DESC);

ALTER TABLE public.home_alarm_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view home alarm log"
  ON public.home_alarm_log FOR SELECT USING (true);

CREATE POLICY "Anyone can insert home alarm log"
  ON public.home_alarm_log FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete home alarm log"
  ON public.home_alarm_log FOR DELETE USING (true);
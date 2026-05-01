CREATE TABLE public.push_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient text NOT NULL DEFAULT 'Alle',
  feature text NOT NULL,
  ok boolean NOT NULL DEFAULT true,
  endpoint text,
  status_code integer,
  error_message text,
  title text,
  body text
);
CREATE INDEX push_send_log_sent_at_idx ON public.push_send_log (sent_at DESC);
CREATE INDEX push_send_log_recipient_idx ON public.push_send_log (recipient);
ALTER TABLE public.push_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view push send log" ON public.push_send_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert push send log" ON public.push_send_log FOR INSERT WITH CHECK (true);
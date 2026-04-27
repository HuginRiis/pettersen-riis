CREATE TABLE public.api_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  endpoint text NOT NULL,
  ok boolean NOT NULL DEFAULT true,
  duration_ms integer,
  status_code integer,
  error_message text,
  cached boolean NOT NULL DEFAULT false,
  metadata jsonb,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_call_log_source_called_at
  ON public.api_call_log (source, called_at DESC);

CREATE INDEX idx_api_call_log_endpoint_called_at
  ON public.api_call_log (endpoint, called_at DESC);

CREATE INDEX idx_api_call_log_called_at
  ON public.api_call_log (called_at DESC);

ALTER TABLE public.api_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view api call log"
  ON public.api_call_log
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert api call log"
  ON public.api_call_log
  FOR INSERT
  WITH CHECK (true);

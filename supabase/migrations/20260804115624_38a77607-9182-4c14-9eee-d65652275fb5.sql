CREATE TABLE public.linketur_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.linketur_state TO service_role;
ALTER TABLE public.linketur_state ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.api_pause_flags (
  source text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_pause_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_pause_flags read public"
  ON public.api_pause_flags
  FOR SELECT
  USING (true);

CREATE TRIGGER api_pause_flags_set_updated_at
  BEFORE UPDATE ON public.api_pause_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
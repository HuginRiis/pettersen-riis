-- Tabell som logger hvert AI-søk slik at vi kan vise statistikk
-- i Vakttårnet og rate-limite uinnloggede besøkende.
CREATE TABLE IF NOT EXISTS public.ai_search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature text NOT NULL,
  query text,
  model text,
  authenticated boolean NOT NULL DEFAULT false,
  ip text,
  user_agent text,
  country text,
  city text,
  status text NOT NULL DEFAULT 'ok',
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_search_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ai search log"
  ON public.ai_search_log FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert ai search log"
  ON public.ai_search_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ai_search_log_created_at_idx
  ON public.ai_search_log (created_at DESC);

CREATE INDEX IF NOT EXISTS ai_search_log_ip_created_at_idx
  ON public.ai_search_log (ip, created_at DESC);

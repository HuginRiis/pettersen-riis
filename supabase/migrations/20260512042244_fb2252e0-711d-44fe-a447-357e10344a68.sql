CREATE TABLE IF NOT EXISTS public.gardena_auth (
  id INT PRIMARY KEY DEFAULT 1,
  access_token TEXT,
  refresh_token TEXT,
  token_type TEXT,
  expires_at TIMESTAMPTZ,
  user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gardena_auth_singleton CHECK (id = 1)
);
ALTER TABLE public.gardena_auth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_client_access_gardena_auth" ON public.gardena_auth FOR ALL USING (false) WITH CHECK (false);
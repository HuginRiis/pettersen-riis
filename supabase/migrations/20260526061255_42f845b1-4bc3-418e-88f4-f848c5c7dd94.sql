CREATE TABLE IF NOT EXISTS public.jaguar_auth (
  id smallint PRIMARY KEY DEFAULT 1,
  email text,
  device_id text,
  access_token text,
  refresh_token text,
  authorization_token text,
  user_id text,
  expires_at timestamptz,
  pending_email text,
  pending_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jaguar_auth_singleton CHECK (id = 1)
);

ALTER TABLE public.jaguar_auth ENABLE ROW LEVEL SECURITY;

-- Ingen policies = ingen klient-tilgang. Bare service-role (server) kan lese/skrive.

INSERT INTO public.jaguar_auth (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
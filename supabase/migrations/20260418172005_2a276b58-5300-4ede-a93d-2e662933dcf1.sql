-- Enable pgcrypto for encryption helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Jaguar InControl connections per user
CREATE TABLE public.jaguar_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  authorization_token TEXT,
  device_id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  user_id_jaguar TEXT,
  vin TEXT,
  vehicle_nickname TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.jaguar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own jaguar connection"
  ON public.jaguar_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own jaguar connection"
  ON public.jaguar_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own jaguar connection"
  ON public.jaguar_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own jaguar connection"
  ON public.jaguar_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Reuse existing updated_at trigger function if it exists, otherwise create it
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_jaguar_connections_updated_at
BEFORE UPDATE ON public.jaguar_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_jaguar_connections_user_id ON public.jaguar_connections(user_id);
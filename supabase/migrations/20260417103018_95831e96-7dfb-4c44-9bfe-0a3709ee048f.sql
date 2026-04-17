CREATE TABLE public.homey_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'athom',
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  athom_user_id text,
  athom_user_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one shared connection for now (admin-managed)
CREATE UNIQUE INDEX homey_connections_provider_unique ON public.homey_connections(provider);

ALTER TABLE public.homey_connections ENABLE ROW LEVEL SECURITY;

-- No public policies: only the service role (server) may access this table.
-- This keeps tokens out of reach from clients entirely.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER homey_connections_set_updated_at
BEFORE UPDATE ON public.homey_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
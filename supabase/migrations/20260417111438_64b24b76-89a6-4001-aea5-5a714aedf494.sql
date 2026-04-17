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

ALTER TABLE public.homey_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_homey_connections_updated_at
BEFORE UPDATE ON public.homey_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
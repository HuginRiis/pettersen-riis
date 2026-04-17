CREATE TABLE public.strava_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'strava',
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  athlete_id bigint,
  athlete_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER strava_connections_set_updated_at
BEFORE UPDATE ON public.strava_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.roborock_auth (
  id int PRIMARY KEY DEFAULT 1,
  email text NOT NULL,
  device_id text NOT NULL,
  country text,
  country_code text,
  base_url text,
  token text,
  rriot jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roborock_auth_singleton CHECK (id = 1)
);
ALTER TABLE public.roborock_auth ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (server-side) reads/writes.

-- Drop unique on user_id and make it nullable; this matches the household-wide pattern (like strava_connections)
ALTER TABLE public.jaguar_connections DROP CONSTRAINT IF EXISTS jaguar_connections_user_id_key;
ALTER TABLE public.jaguar_connections DROP CONSTRAINT IF EXISTS jaguar_connections_user_id_fkey;
ALTER TABLE public.jaguar_connections ALTER COLUMN user_id DROP NOT NULL;

-- Drop the per-user RLS policies; access is gated by the app-level house password instead.
DROP POLICY IF EXISTS "Users view own jaguar connection" ON public.jaguar_connections;
DROP POLICY IF EXISTS "Users insert own jaguar connection" ON public.jaguar_connections;
DROP POLICY IF EXISTS "Users update own jaguar connection" ON public.jaguar_connections;
DROP POLICY IF EXISTS "Users delete own jaguar connection" ON public.jaguar_connections;

-- Deny-all policies so the table is only accessible via the service role (server-side, after house-auth check)
CREATE POLICY "Deny all client access to jaguar_connections"
  ON public.jaguar_connections FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.nsm_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  url text NOT NULL,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nsm_alerts_published_idx ON public.nsm_alerts (published_at DESC NULLS LAST);

GRANT SELECT ON public.nsm_alerts TO anon, authenticated;
GRANT ALL ON public.nsm_alerts TO service_role;
ALTER TABLE public.nsm_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view NSM alerts" ON public.nsm_alerts FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.nsm_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nsm_notification_prefs TO authenticated;
GRANT ALL ON public.nsm_notification_prefs TO service_role;
ALTER TABLE public.nsm_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view nsm prefs" ON public.nsm_notification_prefs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage nsm prefs" ON public.nsm_notification_prefs FOR ALL TO authenticated USING (true) WITH CHECK (true);

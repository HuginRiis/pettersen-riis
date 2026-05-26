
CREATE TABLE public.basseng_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'Basseng',
  device_match text NOT NULL DEFAULT 'basseng',
  enabled boolean NOT NULL DEFAULT true,
  delta numeric NOT NULL DEFAULT 0.5,
  notify_up boolean NOT NULL DEFAULT true,
  notify_down boolean NOT NULL DEFAULT true,
  recipient_up text NOT NULL DEFAULT 'Alle',
  recipient_down text NOT NULL DEFAULT 'Alle',
  active_from text NOT NULL DEFAULT '08:00',
  active_to text NOT NULL DEFAULT '22:00',
  last_value numeric,
  last_checked_at timestamptz,
  last_notified_value numeric,
  last_notified_at timestamptz,
  last_direction text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.basseng_notification_prefs TO anon, authenticated;
GRANT ALL ON public.basseng_notification_prefs TO service_role;

ALTER TABLE public.basseng_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read basseng prefs"
  ON public.basseng_notification_prefs FOR SELECT
  USING (true);

CREATE POLICY "Public can insert basseng prefs"
  ON public.basseng_notification_prefs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update basseng prefs"
  ON public.basseng_notification_prefs FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "Public can delete basseng prefs"
  ON public.basseng_notification_prefs FOR DELETE
  USING (true);

CREATE TRIGGER trg_basseng_prefs_updated_at
  BEFORE UPDATE ON public.basseng_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.basseng_notification_prefs (label) VALUES ('Basseng');


CREATE TABLE public.garmin_threshold_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garmin_owner text NOT NULL DEFAULT 'arne',
  recipient text NOT NULL DEFAULT 'Alle',
  sender_label text NOT NULL DEFAULT 'Garmin',
  enabled boolean NOT NULL DEFAULT true,
  label text,
  metric text NOT NULL,
  direction text NOT NULL DEFAULT 'below',
  threshold numeric NOT NULL,
  cooldown_hours integer NOT NULL DEFAULT 6,
  last_value numeric,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.garmin_threshold_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "garmin_threshold_prefs_all_select" ON public.garmin_threshold_prefs FOR SELECT USING (true);
CREATE POLICY "garmin_threshold_prefs_all_insert" ON public.garmin_threshold_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "garmin_threshold_prefs_all_update" ON public.garmin_threshold_prefs FOR UPDATE USING (true);
CREATE POLICY "garmin_threshold_prefs_all_delete" ON public.garmin_threshold_prefs FOR DELETE USING (true);

CREATE TRIGGER set_garmin_threshold_prefs_updated_at
  BEFORE UPDATE ON public.garmin_threshold_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

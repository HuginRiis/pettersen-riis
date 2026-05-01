-- Regler for "lys på uten bevegelse"-varsler per Homey-zone (rom).
-- Hver regel knytter seg til ett rom (zone) i Homey som har både lys og bevegelsessensor,
-- og varsler push-mottakere hvis lysene har vært på lenger enn lights_on_minutes
-- og det ikke har vært bevegelse de siste no_motion_minutes minuttene.

CREATE TABLE public.light_idle_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homey_zone_id text NOT NULL,
  zone_name text NOT NULL,
  recipient text NOT NULL DEFAULT 'Alle',
  lights_on_minutes integer NOT NULL DEFAULT 30,
  no_motion_minutes integer NOT NULL DEFAULT 15,
  enabled boolean NOT NULL DEFAULT true,
  cooldown_minutes integer NOT NULL DEFAULT 60,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.light_idle_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view light idle prefs"
  ON public.light_idle_notification_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert light idle prefs"
  ON public.light_idle_notification_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update light idle prefs"
  ON public.light_idle_notification_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete light idle prefs"
  ON public.light_idle_notification_prefs FOR DELETE USING (true);

CREATE TRIGGER set_light_idle_prefs_updated_at
  BEFORE UPDATE ON public.light_idle_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
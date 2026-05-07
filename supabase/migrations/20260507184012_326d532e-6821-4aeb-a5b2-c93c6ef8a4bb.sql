
CREATE TABLE public.met_alert_notification_prefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient text NOT NULL DEFAULT 'Alle',
  counties text[] NOT NULL DEFAULT ARRAY[]::text[],
  event_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  min_color text NOT NULL DEFAULT 'Yellow',
  enabled boolean NOT NULL DEFAULT true,
  notified_alert_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.met_alert_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view met alert prefs" ON public.met_alert_notification_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert met alert prefs" ON public.met_alert_notification_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update met alert prefs" ON public.met_alert_notification_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete met alert prefs" ON public.met_alert_notification_prefs FOR DELETE USING (true);

CREATE TRIGGER set_met_alert_prefs_updated_at
BEFORE UPDATE ON public.met_alert_notification_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

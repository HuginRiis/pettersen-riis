CREATE TABLE public.mail_delivery_prefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  postal_code text NOT NULL DEFAULT '3736',
  enabled boolean NOT NULL DEFAULT true,
  recipient text NOT NULL DEFAULT 'Alle',
  days_before integer NOT NULL DEFAULT 0,
  notify_hour integer NOT NULL DEFAULT 8,
  notify_minute integer NOT NULL DEFAULT 0,
  last_notified_for_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mail_delivery_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view mail delivery prefs" ON public.mail_delivery_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert mail delivery prefs" ON public.mail_delivery_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update mail delivery prefs" ON public.mail_delivery_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete mail delivery prefs" ON public.mail_delivery_prefs FOR DELETE USING (true);

CREATE TRIGGER mail_delivery_prefs_updated_at
  BEFORE UPDATE ON public.mail_delivery_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.mail_delivery_prefs (postal_code, enabled, recipient, days_before, notify_hour, notify_minute)
VALUES ('3736', true, 'Alle', 0, 8, 0);
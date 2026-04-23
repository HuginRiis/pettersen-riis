-- Innstilling for adresse til renovasjon (kun én rad — singleton)
CREATE TABLE public.garbage_address (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'Borgen',
  address_text text NOT NULL,
  kommunenr text NOT NULL,
  gatenavn text NOT NULL,
  gatekode text NOT NULL,
  husnr text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.garbage_address ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view garbage address" ON public.garbage_address FOR SELECT USING (true);
CREATE POLICY "Anyone can insert garbage address" ON public.garbage_address FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update garbage address" ON public.garbage_address FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete garbage address" ON public.garbage_address FOR DELETE USING (true);

CREATE TRIGGER set_garbage_address_updated_at
BEFORE UPDATE ON public.garbage_address
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Varsel-preferanser per fraksjon
CREATE TABLE public.garbage_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fraksjon_id integer NOT NULL UNIQUE,
  fraksjon_navn text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  days_before integer NOT NULL DEFAULT 1,
  notify_hour integer NOT NULL DEFAULT 20,
  notify_minute integer NOT NULL DEFAULT 0,
  who text NOT NULL DEFAULT 'Alle',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.garbage_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view garbage notif prefs" ON public.garbage_notification_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert garbage notif prefs" ON public.garbage_notification_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update garbage notif prefs" ON public.garbage_notification_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete garbage notif prefs" ON public.garbage_notification_prefs FOR DELETE USING (true);

CREATE TRIGGER set_garbage_notif_prefs_updated_at
BEFORE UPDATE ON public.garbage_notification_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Logg over sendte varsler (unngå dobbeltvarsling)
CREATE TABLE public.garbage_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fraksjon_id integer NOT NULL,
  pickup_date date NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fraksjon_id, pickup_date)
);

ALTER TABLE public.garbage_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view garbage notif log" ON public.garbage_notification_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert garbage notif log" ON public.garbage_notification_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete garbage notif log" ON public.garbage_notification_log FOR DELETE USING (true);
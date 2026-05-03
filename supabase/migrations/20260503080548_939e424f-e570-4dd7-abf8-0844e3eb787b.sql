CREATE TABLE public.warranty_global_prefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient text NOT NULL UNIQUE,
  notify_30 boolean NOT NULL DEFAULT true,
  notify_60 boolean NOT NULL DEFAULT true,
  notify_90 boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warranty_global_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view warranty global prefs" ON public.warranty_global_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert warranty global prefs" ON public.warranty_global_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update warranty global prefs" ON public.warranty_global_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete warranty global prefs" ON public.warranty_global_prefs FOR DELETE USING (true);

CREATE TRIGGER trg_warranty_global_prefs_updated_at
BEFORE UPDATE ON public.warranty_global_prefs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
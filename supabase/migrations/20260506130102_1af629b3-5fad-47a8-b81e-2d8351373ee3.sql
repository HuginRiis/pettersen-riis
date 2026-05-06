CREATE TABLE public.web_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  who TEXT NOT NULL DEFAULT 'Alle',
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Globe',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.web_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view web favorites" ON public.web_favorites FOR SELECT USING (true);
CREATE POLICY "Anyone can insert web favorites" ON public.web_favorites FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update web favorites" ON public.web_favorites FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete web favorites" ON public.web_favorites FOR DELETE USING (true);

CREATE TRIGGER set_web_favorites_updated_at
  BEFORE UPDATE ON public.web_favorites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_web_favorites_who ON public.web_favorites(who);
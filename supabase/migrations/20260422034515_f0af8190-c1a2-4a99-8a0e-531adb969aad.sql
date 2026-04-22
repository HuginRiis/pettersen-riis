
CREATE TABLE public.grocery_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ean text NOT NULL UNIQUE,
  name text NOT NULL,
  brand text,
  image_url text,
  vendor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grocery_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view grocery favorites"
  ON public.grocery_favorites FOR SELECT USING (true);

CREATE POLICY "Anyone can insert grocery favorites"
  ON public.grocery_favorites FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete grocery favorites"
  ON public.grocery_favorites FOR DELETE USING (true);

CREATE INDEX idx_grocery_favorites_created ON public.grocery_favorites (created_at DESC);

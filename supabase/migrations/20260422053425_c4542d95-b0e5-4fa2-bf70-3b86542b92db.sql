-- Utvid grocery_favorites til full handleliste
ALTER TABLE public.grocery_favorites
  ALTER COLUMN ean DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Annet',
  ADD COLUMN IF NOT EXISTS checked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Tillat oppdatering så vi kan hake av / endre kategori
DROP POLICY IF EXISTS "Anyone can update grocery favorites" ON public.grocery_favorites;
CREATE POLICY "Anyone can update grocery favorites"
  ON public.grocery_favorites
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
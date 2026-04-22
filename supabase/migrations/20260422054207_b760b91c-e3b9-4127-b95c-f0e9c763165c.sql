ALTER TABLE public.grocery_favorites
  ADD COLUMN IF NOT EXISTS kassal_category text,
  ADD COLUMN IF NOT EXISTS price_nok numeric;
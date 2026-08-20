CREATE TABLE public.kosthold_meals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  who TEXT NOT NULL DEFAULT 'Alle',
  eaten_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  meal_type TEXT NOT NULL DEFAULT 'annet',
  name TEXT NOT NULL,
  amount_text TEXT,
  kcal NUMERIC,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  fat_g NUMERIC,
  fiber_g NUMERIC,
  sugar_g NUMERIC,
  lactose_free BOOLEAN,
  source TEXT NOT NULL DEFAULT 'manual',
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT ALL ON public.kosthold_meals TO service_role;
ALTER TABLE public.kosthold_meals ENABLE ROW LEVEL SECURITY;
CREATE INDEX kosthold_meals_eaten_at_idx ON public.kosthold_meals (eaten_at DESC);
CREATE TRIGGER kosthold_meals_updated_at BEFORE UPDATE ON public.kosthold_meals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
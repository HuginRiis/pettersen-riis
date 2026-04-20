CREATE TABLE public.user_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view favorites"
ON public.user_favorites FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert favorites"
ON public.user_favorites FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can delete favorites"
ON public.user_favorites FOR DELETE
USING (true);
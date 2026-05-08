ALTER TABLE public.user_menu_prefs
  ADD COLUMN IF NOT EXISTS favorite_zones text[] NOT NULL DEFAULT '{}'::text[];
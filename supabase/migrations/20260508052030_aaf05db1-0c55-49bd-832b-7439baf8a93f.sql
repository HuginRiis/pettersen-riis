
CREATE TABLE IF NOT EXISTS public.user_menu_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  who text NOT NULL UNIQUE,
  favorites text[] NOT NULL DEFAULT '{}',
  sort_by_usage boolean NOT NULL DEFAULT false,
  favorites_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_menu_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view user_menu_prefs" ON public.user_menu_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert user_menu_prefs" ON public.user_menu_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update user_menu_prefs" ON public.user_menu_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete user_menu_prefs" ON public.user_menu_prefs FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.user_light_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  who text NOT NULL,
  slot int NOT NULL,
  name text NOT NULL DEFAULT 'Scene',
  device_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (who, slot)
);
ALTER TABLE public.user_light_scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view user_light_scenes" ON public.user_light_scenes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert user_light_scenes" ON public.user_light_scenes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update user_light_scenes" ON public.user_light_scenes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete user_light_scenes" ON public.user_light_scenes FOR DELETE USING (true);

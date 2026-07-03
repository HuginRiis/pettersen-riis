
DROP POLICY IF EXISTS "Authenticated can view weather summary prefs" ON public.weather_summary_push_prefs;
DROP POLICY IF EXISTS "Authenticated can insert weather summary prefs" ON public.weather_summary_push_prefs;
DROP POLICY IF EXISTS "Authenticated can update weather summary prefs" ON public.weather_summary_push_prefs;
DROP POLICY IF EXISTS "Authenticated can delete weather summary prefs" ON public.weather_summary_push_prefs;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_summary_push_prefs TO anon, authenticated;
GRANT ALL ON public.weather_summary_push_prefs TO service_role;

CREATE POLICY "Anyone can view weather summary prefs" ON public.weather_summary_push_prefs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert weather summary prefs" ON public.weather_summary_push_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update weather summary prefs" ON public.weather_summary_push_prefs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete weather summary prefs" ON public.weather_summary_push_prefs FOR DELETE USING (true);

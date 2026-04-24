-- Tabell for å huske default-sted per bruker (Arne/Rebekka) per IP, per side (vær/pollen)
CREATE TABLE public.user_location_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  who text NOT NULL,                       -- 'Arne' | 'Rebekka' | annet navn
  ip text NOT NULL,                        -- IP-adressen brukeren ble husket på
  page text NOT NULL,                      -- 'var' | 'pollen' (egen default per side)
  place_label text NOT NULL,               -- "Tollnes, Skien" osv.
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (who, ip, page)
);

CREATE INDEX idx_user_location_prefs_lookup ON public.user_location_prefs (ip, page);

ALTER TABLE public.user_location_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view location prefs"
  ON public.user_location_prefs FOR SELECT USING (true);

CREATE POLICY "Anyone can insert location prefs"
  ON public.user_location_prefs FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update location prefs"
  ON public.user_location_prefs FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete location prefs"
  ON public.user_location_prefs FOR DELETE USING (true);

-- Tabell for å huske hvilket navn (Arne/Rebekka) som tilhører en gitt IP (siste valg vinner)
CREATE TABLE public.ip_user_mapping (
  ip text PRIMARY KEY,
  who text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_user_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ip user mapping"
  ON public.ip_user_mapping FOR SELECT USING (true);

CREATE POLICY "Anyone can insert ip user mapping"
  ON public.ip_user_mapping FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update ip user mapping"
  ON public.ip_user_mapping FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete ip user mapping"
  ON public.ip_user_mapping FOR DELETE USING (true);

CREATE TABLE public.tax_monthly (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  lonn numeric not null default 0,
  skatt numeric not null default 0,
  ekstra numeric not null default 0,
  source text,
  updated_at timestamptz not null default now(),
  unique (year, month)
);

CREATE TABLE public.tax_year_settings (
  year int primary key,
  skal_betale numeric not null default 0,
  ekstra_pr_mnd numeric not null default 0,
  updated_at timestamptz not null default now()
);

ALTER TABLE public.tax_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_year_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_monthly read" ON public.tax_monthly FOR SELECT USING (true);
CREATE POLICY "tax_monthly write" ON public.tax_monthly FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tax_year_settings read" ON public.tax_year_settings FOR SELECT USING (true);
CREATE POLICY "tax_year_settings write" ON public.tax_year_settings FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.tax_year_settings (year, skal_betale, ekstra_pr_mnd) VALUES
  (2024, 302000, 1500),
  (2025, 312767, 1000),
  (2026, 312767, 1000)
ON CONFLICT (year) DO NOTHING;

INSERT INTO public.tax_monthly (year, month, lonn, skatt, ekstra) VALUES
  (2024,1,69170,21276,2000),(2024,2,79599,26519,0),(2024,3,69138,21276,0),(2024,4,68851,21125,500),
  (2024,5,126743,47792,500),(2024,6,95116,0,1500),(2024,7,71730,23179,1500),(2024,8,69267,21927,1500),
  (2024,9,71742,24679,1500),(2024,10,87566,28055,2000),(2024,11,77133,12867,2000),(2024,12,69333,20624,2000),
  (2025,1,70210,22921,500),(2025,2,69333,22420,500),(2025,3,73315,24474,500),(2025,4,76810,26227,1000),
  (2025,5,141320,56185,1000),(2025,6,87368,0,1000),(2025,7,69333,21769,1000),(2025,8,74305,24975,1000),
  (2025,9,72225,23923,1000),(2025,10,74658,25892,1000),(2025,11,73733,26007,1000),(2025,12,71108,13086,1000),
  (2026,1,78600,26546,1000),(2026,2,81108,22647,1000),(2026,3,74281,24367,1000),(2026,4,74281,24367,1000),
  (2026,5,74281,24367,1000),(2026,6,74281,0,1000),(2026,7,74281,24367,1000),(2026,8,74281,24367,1000),
  (2026,9,74281,24367,1000),(2026,10,74281,24367,1000),(2026,11,74281,24367,1000),(2026,12,74281,24367,1000)
ON CONFLICT (year, month) DO NOTHING;

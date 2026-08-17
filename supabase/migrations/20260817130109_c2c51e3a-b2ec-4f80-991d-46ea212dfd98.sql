CREATE TABLE IF NOT EXISTS public.budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
  color text NOT NULL DEFAULT '#60a5fa',
  icon text NOT NULL DEFAULT 'wallet',
  monthly_budget numeric,
  yearly_budget numeric,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.budget_categories TO service_role;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.budget_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_on date NOT NULL,
  category_id uuid REFERENCES public.budget_categories(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  kind text NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
  store text,
  note text,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('approved','pending')),
  created_by text,
  account text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budget_expenses_date_idx ON public.budget_expenses (occurred_on DESC);
GRANT ALL ON public.budget_expenses TO service_role;
ALTER TABLE public.budget_expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.budget_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL UNIQUE,
  category_id uuid NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  hits integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.budget_rules TO service_role;
ALTER TABLE public.budget_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.budget_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.budget_settings TO service_role;
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.budget_categories (name, kind, color, position) VALUES
  ('Mat og dagligvarer','expense','#22c55e',1),
  ('Drivstoff','expense','#fbbf24',2),
  ('Transport','expense','#38bdf8',3),
  ('Restaurant og kafé','expense','#f472b6',4),
  ('Abonnementer','expense','#a78bfa',5),
  ('Mobil','expense','#60a5fa',6),
  ('Internett','expense','#0ea5e9',7),
  ('TV og strømming','expense','#c084fc',8),
  ('Klær og sko','expense','#fb923c',9),
  ('Helse og apotek','expense','#ef4444',10),
  ('Vedlikehold hus','expense','#94a3b8',11),
  ('Strøm','expense','#eab308',12),
  ('Kommunale avgifter','expense','#64748b',13),
  ('Forsikring','expense','#10b981',14),
  ('Lån og renter','expense','#dc2626',15),
  ('Fritid','expense','#34d399',16),
  ('Ferie','expense','#06b6d4',17),
  ('Gaver','expense','#f59e0b',18),
  ('Sparing','expense','#d4af37',19),
  ('Overføringer','expense','#71717a',20),
  ('Annet','expense','#9ca3af',21),
  ('Lønn og inntekt','income','#22c55e',22)
ON CONFLICT DO NOTHING;
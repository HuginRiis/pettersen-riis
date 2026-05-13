
CREATE TABLE IF NOT EXISTS public.okonomi_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  monthly_budget NUMERIC(12,2),
  yearly_budget NUMERIC(12,2),
  sort_order INT NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT false,
  is_income BOOLEAN NOT NULL DEFAULT false,
  is_transfer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.okonomi_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "okonomi_cat_all_select" ON public.okonomi_categories;
DROP POLICY IF EXISTS "okonomi_cat_all_insert" ON public.okonomi_categories;
DROP POLICY IF EXISTS "okonomi_cat_all_update" ON public.okonomi_categories;
DROP POLICY IF EXISTS "okonomi_cat_all_delete" ON public.okonomi_categories;
CREATE POLICY "okonomi_cat_all_select" ON public.okonomi_categories FOR SELECT USING (true);
CREATE POLICY "okonomi_cat_all_insert" ON public.okonomi_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "okonomi_cat_all_update" ON public.okonomi_categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "okonomi_cat_all_delete" ON public.okonomi_categories FOR DELETE USING (true);
DROP TRIGGER IF EXISTS trg_okonomi_cat_updated ON public.okonomi_categories;
CREATE TRIGGER trg_okonomi_cat_updated BEFORE UPDATE ON public.okonomi_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.okonomi_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  txn_date DATE NOT NULL,
  description TEXT NOT NULL,
  merchant TEXT,
  amount NUMERIC(12,2) NOT NULL,
  category_id UUID REFERENCES public.okonomi_categories(id) ON DELETE SET NULL,
  account TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  external_ref TEXT,
  note TEXT,
  approved BOOLEAN NOT NULL DEFAULT true,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_okonomi_txn_date ON public.okonomi_transactions(txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_okonomi_txn_cat ON public.okonomi_transactions(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_okonomi_txn_extref ON public.okonomi_transactions(external_ref) WHERE external_ref IS NOT NULL;
ALTER TABLE public.okonomi_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "okonomi_txn_all_select" ON public.okonomi_transactions;
DROP POLICY IF EXISTS "okonomi_txn_all_insert" ON public.okonomi_transactions;
DROP POLICY IF EXISTS "okonomi_txn_all_update" ON public.okonomi_transactions;
DROP POLICY IF EXISTS "okonomi_txn_all_delete" ON public.okonomi_transactions;
CREATE POLICY "okonomi_txn_all_select" ON public.okonomi_transactions FOR SELECT USING (true);
CREATE POLICY "okonomi_txn_all_insert" ON public.okonomi_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "okonomi_txn_all_update" ON public.okonomi_transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "okonomi_txn_all_delete" ON public.okonomi_transactions FOR DELETE USING (true);
DROP TRIGGER IF EXISTS trg_okonomi_txn_updated ON public.okonomi_transactions;
CREATE TRIGGER trg_okonomi_txn_updated BEFORE UPDATE ON public.okonomi_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.okonomi_budget_settings (
  id INT PRIMARY KEY DEFAULT 1,
  savings_target_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  primary_account TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
ALTER TABLE public.okonomi_budget_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "okonomi_set_all_select" ON public.okonomi_budget_settings;
DROP POLICY IF EXISTS "okonomi_set_all_insert" ON public.okonomi_budget_settings;
DROP POLICY IF EXISTS "okonomi_set_all_update" ON public.okonomi_budget_settings;
CREATE POLICY "okonomi_set_all_select" ON public.okonomi_budget_settings FOR SELECT USING (true);
CREATE POLICY "okonomi_set_all_insert" ON public.okonomi_budget_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "okonomi_set_all_update" ON public.okonomi_budget_settings FOR UPDATE USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_okonomi_set_updated ON public.okonomi_budget_settings;
CREATE TRIGGER trg_okonomi_set_updated BEFORE UPDATE ON public.okonomi_budget_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.okonomi_budget_settings(id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.okonomi_merchant_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.okonomi_categories(id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pattern)
);
ALTER TABLE public.okonomi_merchant_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "okonomi_rule_all_select" ON public.okonomi_merchant_rules;
DROP POLICY IF EXISTS "okonomi_rule_all_insert" ON public.okonomi_merchant_rules;
DROP POLICY IF EXISTS "okonomi_rule_all_update" ON public.okonomi_merchant_rules;
DROP POLICY IF EXISTS "okonomi_rule_all_delete" ON public.okonomi_merchant_rules;
CREATE POLICY "okonomi_rule_all_select" ON public.okonomi_merchant_rules FOR SELECT USING (true);
CREATE POLICY "okonomi_rule_all_insert" ON public.okonomi_merchant_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "okonomi_rule_all_update" ON public.okonomi_merchant_rules FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "okonomi_rule_all_delete" ON public.okonomi_merchant_rules FOR DELETE USING (true);
DROP TRIGGER IF EXISTS trg_okonomi_rule_updated ON public.okonomi_merchant_rules;
CREATE TRIGGER trg_okonomi_rule_updated BEFORE UPDATE ON public.okonomi_merchant_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.okonomi_categories (name, icon, color, sort_order, is_income, is_transfer) VALUES
  ('Mat og dagligvarer','utensils','#34d399',10,false,false),
  ('Bolig og husleie','home','#a78bfa',20,false,false),
  ('Strøm','zap','#fbbf24',30,false,false),
  ('Hus og vedlikehold','wrench','#f59e0b',40,false,false),
  ('Hytta Rogaland','tent-tree','#22c55e',50,false,false),
  ('Bil','car','#60a5fa',60,false,false),
  ('Drivstoff','fuel','#f97316',70,false,false),
  ('Forsikring','shield','#3b82f6',80,false,false),
  ('Lån og renter','landmark','#94a3b8',90,false,false),
  ('Telefon og internett','wifi','#06b6d4',100,false,false),
  ('Abonnementer','tv','#a855f7',110,false,false),
  ('Klær og sko','shirt','#ec4899',120,false,false),
  ('Helse og apotek','cross','#10b981',130,false,false),
  ('Fritid og hobby','music','#f59e0b',140,false,false),
  ('Restaurant og kafé','coffee','#fb7185',150,false,false),
  ('Barn','baby','#fbcfe8',160,false,false),
  ('Kjæledyr','paw-print','#fb923c',170,false,false),
  ('Gaver','gift','#e879f9',180,false,false),
  ('Ferie og reise','plane','#2dd4bf',190,false,false),
  ('Sparing','piggy-bank','#22c55e',200,false,false),
  ('Penger til barna','hand-coins','#f472b6',210,false,false),
  ('Annet','more-horizontal','#cbd5e1',900,false,false),
  ('Lønn og inntekt','wallet','#10b981',1000,true,false),
  ('Overføringer','arrow-left-right','#a78bfa',2000,false,true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.okonomi_merchant_rules (pattern, category_id, priority)
SELECT v.pat, c.id, v.prio FROM (VALUES
  ('coop','Mat og dagligvarer',10),
  ('rema','Mat og dagligvarer',10),
  ('kiwi','Mat og dagligvarer',10),
  ('meny','Mat og dagligvarer',10),
  ('bunnpris','Mat og dagligvarer',10),
  ('joker','Mat og dagligvarer',10),
  ('extra','Mat og dagligvarer',10),
  ('spar','Mat og dagligvarer',10),
  ('europris','Mat og dagligvarer',10),
  ('vinmonopol','Mat og dagligvarer',10),
  ('circle k','Drivstoff',10),
  ('circlek','Drivstoff',10),
  ('shell','Drivstoff',10),
  ('esso','Drivstoff',10),
  ('uno-x','Drivstoff',10),
  ('yx ','Drivstoff',10),
  ('st1','Drivstoff',10),
  ('vy ','Bil',10),
  ('autopass','Bil',10),
  ('ferde','Bil',10),
  ('fjellinjen','Bil',10),
  ('biltema','Hus og vedlikehold',10),
  ('clas ohlson','Hus og vedlikehold',10),
  ('jernia','Hus og vedlikehold',10),
  ('byggmakker','Hus og vedlikehold',10),
  ('maxbo','Hus og vedlikehold',10),
  ('obs bygg','Hus og vedlikehold',10),
  ('plantasjen','Hus og vedlikehold',10),
  ('ikea','Hus og vedlikehold',10),
  ('elkjøp','Hus og vedlikehold',10),
  ('elkjop','Hus og vedlikehold',10),
  ('power','Hus og vedlikehold',10),
  ('telenor','Telefon og internett',10),
  ('telia','Telefon og internett',10),
  ('ice ','Telefon og internett',10),
  ('altibox','Telefon og internett',10),
  ('netflix','Abonnementer',10),
  ('spotify','Abonnementer',10),
  ('hbo','Abonnementer',10),
  ('disney','Abonnementer',10),
  ('viaplay','Abonnementer',10),
  ('storytel','Abonnementer',10),
  ('apple.com','Abonnementer',10),
  ('icloud','Abonnementer',10),
  ('microsoft','Abonnementer',10),
  ('apotek','Helse og apotek',10),
  ('boots','Helse og apotek',10),
  ('vitusapotek','Helse og apotek',10),
  ('mcdonald','Restaurant og kafé',10),
  ('burger king','Restaurant og kafé',10),
  ('peppes','Restaurant og kafé',10),
  ('starbucks','Restaurant og kafé',10),
  ('espresso','Restaurant og kafé',10),
  ('kaffebrenneriet','Restaurant og kafé',10),
  ('cubus','Klær og sko',10),
  ('h&m','Klær og sko',10),
  ('zalando','Klær og sko',10),
  ('lindex','Klær og sko',10),
  ('xxl','Fritid og hobby',10),
  ('intersport','Fritid og hobby',10),
  ('skagerak energi','Strøm',10),
  ('lyse','Strøm',10),
  ('fjordkraft','Strøm',10),
  ('tibber','Strøm',10),
  ('hafslund','Strøm',10),
  ('if forsikring','Forsikring',10),
  ('gjensidige','Forsikring',10),
  ('tryg','Forsikring',10),
  ('storebrand','Forsikring',10),
  ('fremtind','Forsikring',10),
  ('telemark fylkes','Lønn og inntekt',10),
  ('lønn','Lønn og inntekt',5),
  ('overføring','Overføringer',5),
  ('overforing','Overføringer',5)
) AS v(pat, catname, prio)
JOIN public.okonomi_categories c ON c.name = v.catname
ON CONFLICT (pattern) DO NOTHING;

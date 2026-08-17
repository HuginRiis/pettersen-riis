CREATE TABLE public.fin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.fin_categories(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'expense',
  color text,
  icon text,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fin_categories TO service_role;
ALTER TABLE public.fin_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fin_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  total_rows int NOT NULL DEFAULT 0,
  inserted int NOT NULL DEFAULT 0,
  duplicates int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.fin_imports TO service_role;
ALTER TABLE public.fin_imports ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_date date NOT NULL,
  booked_date date,
  description text NOT NULL DEFAULT '',
  counterparty text,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NOK',
  tx_type text NOT NULL DEFAULT 'expense',
  bank_type text,
  bank_subtype text,
  account text,
  to_account text,
  reference text,
  bank_status text,
  category_id uuid REFERENCES public.fin_categories(id) ON DELETE SET NULL,
  ai_category text,
  ai_confidence numeric,
  ai_reason text,
  needs_review boolean NOT NULL DEFAULT true,
  is_manual_category boolean NOT NULL DEFAULT false,
  comment text,
  source text NOT NULL DEFAULT 'csv',
  import_id uuid REFERENCES public.fin_imports(id) ON DELETE SET NULL,
  receipt_id uuid REFERENCES public.receipts(id) ON DELETE SET NULL,
  dup_of uuid REFERENCES public.fin_transactions(id) ON DELETE SET NULL,
  dup_status text NOT NULL DEFAULT 'none',
  dedupe_key text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fin_transactions TO service_role;
ALTER TABLE public.fin_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX fin_tx_date_idx ON public.fin_transactions (tx_date DESC);
CREATE INDEX fin_tx_dedupe_idx ON public.fin_transactions (dedupe_key);
CREATE INDEX fin_tx_category_idx ON public.fin_transactions (category_id);
CREATE INDEX fin_tx_deleted_idx ON public.fin_transactions (deleted_at);
CREATE INDEX fin_tx_desc_idx ON public.fin_transactions (lower(description));

CREATE TABLE public.fin_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.fin_categories(id) ON DELETE CASCADE,
  tx_type text,
  hits int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fin_rules TO service_role;
ALTER TABLE public.fin_rules ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER fin_categories_updated_at BEFORE UPDATE ON public.fin_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fin_transactions_updated_at BEFORE UPDATE ON public.fin_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fin_rules_updated_at BEFORE UPDATE ON public.fin_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed hovedkategorier
INSERT INTO public.fin_categories (name, kind, color, sort_order) VALUES
  ('Bolig','expense','#f59e0b',10),
  ('Mat og dagligvarer','expense','#22c55e',20),
  ('Bil','expense','#38bdf8',30),
  ('Transport','expense','#0ea5e9',40),
  ('Forsikring','expense','#a78bfa',50),
  ('Strøm','expense','#eab308',60),
  ('Telefon og internett','expense','#60a5fa',70),
  ('Helse','expense','#ef4444',80),
  ('Klær','expense','#f472b6',90),
  ('Elektronikk','expense','#94a3b8',100),
  ('Hus og hjem','expense','#d4af37',110),
  ('Fritid','expense','#34d399',120),
  ('Ferie og reise','expense','#22d3ee',130),
  ('Restaurant og uteliv','expense','#fb923c',140),
  ('Abonnementer','expense','#c084fc',150),
  ('Bank og finans','expense','#64748b',160),
  ('Skatt og offentlige betalinger','expense','#dc2626',170),
  ('Lønn og inntekter','income','#10b981',180),
  ('Overføringer','internal','#8b8b8b',190),
  ('Annet','expense','#9ca3af',200);

INSERT INTO public.fin_categories (name, parent_id, kind, sort_order)
SELECT s.name, c.id, 'expense', s.ord
FROM public.fin_categories c
JOIN (VALUES ('Drivstoff',10),('Bilforsikring',20),('Service',30),('Reparasjoner',40),('Bom',50),('Parkering',60),('Bilutgifter ellers',70)) AS s(name, ord) ON true
WHERE c.name = 'Bil' AND c.parent_id IS NULL;

INSERT INTO public.fin_categories (name, parent_id, kind, sort_order)
SELECT s.name, c.id, 'expense', s.ord
FROM public.fin_categories c
JOIN (VALUES ('Husleie/lån',10),('Kommunale avgifter',20),('Vedlikehold',30),('Boligforsikring',40)) AS s(name, ord) ON true
WHERE c.name = 'Bolig' AND c.parent_id IS NULL;

INSERT INTO public.fin_categories (name, parent_id, kind, sort_order)
SELECT s.name, c.id, 'income', s.ord
FROM public.fin_categories c
JOIN (VALUES ('Lønn',10),('Refusjon',20),('Renteinntekt',30),('Annen inntekt',40)) AS s(name, ord) ON true
WHERE c.name = 'Lønn og inntekter' AND c.parent_id IS NULL;

-- Aggregert statistikk for regnskapssiden
CREATE OR REPLACE FUNCTION public.fin_stats(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v jsonb;
BEGIN
  WITH base AS (
    SELECT t.*,
      COALESCE(p.name, c.name, 'Ukategorisert') AS top_category,
      c.name AS category_name
    FROM public.fin_transactions t
    LEFT JOIN public.fin_categories c ON c.id = t.category_id
    LEFT JOIN public.fin_categories p ON p.id = c.parent_id
    WHERE t.deleted_at IS NULL
      AND (p_from IS NULL OR t.tx_date >= p_from)
      AND (p_to IS NULL OR t.tx_date <= p_to)
  ),
  flow AS (SELECT * FROM base WHERE tx_type <> 'internal'),
  kpi AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS income,
      COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0) AS expense,
      COALESCE(SUM(amount), 0) AS net
    FROM flow
  ),
  counts AS (
    SELECT
      COUNT(*) AS tx_count,
      COUNT(*) FILTER (WHERE category_id IS NULL) AS uncategorized,
      COUNT(*) FILTER (WHERE needs_review) AS needs_review,
      COUNT(*) FILTER (WHERE dup_status = 'possible') AS possible_dups,
      COUNT(*) FILTER (WHERE receipt_id IS NOT NULL) AS with_receipt,
      COUNT(*) FILTER (WHERE ai_category IS NOT NULL) AS ai_done
    FROM base
  ),
  monthly AS (
    SELECT to_char(date_trunc('month', tx_date), 'YYYY-MM') AS month,
      COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS income,
      COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0) AS expense,
      COALESCE(SUM(amount), 0) AS net
    FROM flow GROUP BY 1
  ),
  yearly AS (
    SELECT to_char(date_trunc('year', tx_date), 'YYYY') AS year,
      COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS income,
      COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0) AS expense
    FROM flow GROUP BY 1
  ),
  by_cat AS (
    SELECT top_category AS category, -SUM(amount) AS amount, COUNT(*) AS cnt
    FROM flow WHERE amount < 0 GROUP BY 1 ORDER BY 2 DESC
  ),
  by_sub AS (
    SELECT COALESCE(category_name,'Ukategorisert') AS category, -SUM(amount) AS amount, COUNT(*) AS cnt
    FROM flow WHERE amount < 0 GROUP BY 1 ORDER BY 2 DESC LIMIT 30
  ),
  top_exp AS (
    SELECT id, tx_date, description, counterparty, -amount AS amount, top_category AS category
    FROM flow WHERE amount < 0 ORDER BY amount ASC LIMIT 10
  ),
  top_merch AS (
    SELECT COALESCE(NULLIF(counterparty,''), description) AS merchant, -SUM(amount) AS amount, COUNT(*) AS cnt
    FROM flow WHERE amount < 0 GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  )
  SELECT jsonb_build_object(
    'income', (SELECT income FROM kpi),
    'expense', (SELECT expense FROM kpi),
    'net', (SELECT net FROM kpi),
    'tx_count', (SELECT tx_count FROM counts),
    'uncategorized', (SELECT uncategorized FROM counts),
    'needs_review', (SELECT needs_review FROM counts),
    'possible_dups', (SELECT possible_dups FROM counts),
    'with_receipt', (SELECT with_receipt FROM counts),
    'ai_done', (SELECT ai_done FROM counts),
    'months', (SELECT COUNT(*) FROM monthly),
    'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('month',month,'income',income,'expense',expense,'net',net) ORDER BY month) FROM monthly), '[]'::jsonb),
    'yearly', COALESCE((SELECT jsonb_agg(jsonb_build_object('year',year,'income',income,'expense',expense) ORDER BY year) FROM yearly), '[]'::jsonb),
    'by_category', COALESCE((SELECT jsonb_agg(jsonb_build_object('category',category,'amount',amount,'count',cnt)) FROM by_cat), '[]'::jsonb),
    'by_subcategory', COALESCE((SELECT jsonb_agg(jsonb_build_object('category',category,'amount',amount,'count',cnt)) FROM by_sub), '[]'::jsonb),
    'top_expenses', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'date',tx_date,'description',description,'counterparty',counterparty,'amount',amount,'category',category)) FROM top_exp), '[]'::jsonb),
    'top_merchants', COALESCE((SELECT jsonb_agg(jsonb_build_object('merchant',merchant,'amount',amount,'count',cnt)) FROM top_merch), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;

-- Faste utgifter / abonnementer
CREATE OR REPLACE FUNCTION public.fin_recurring()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v jsonb;
BEGIN
  WITH base AS (
    SELECT
      lower(regexp_replace(COALESCE(NULLIF(counterparty,''), description), '[0-9]{2,}', '', 'g')) AS merchant_key,
      COALESCE(NULLIF(counterparty,''), description) AS merchant,
      tx_date, amount, category_id
    FROM public.fin_transactions
    WHERE deleted_at IS NULL AND amount < 0 AND tx_type <> 'internal'
      AND tx_date > now() - interval '3 years'
  ),
  agg AS (
    SELECT merchant_key,
      MAX(merchant) AS merchant,
      COUNT(*) AS cnt,
      AVG(-amount) AS avg_amount,
      MIN(tx_date) AS first_date,
      MAX(tx_date) AS last_date,
      stddev_pop(-amount) AS amount_sd,
      (MAX(tx_date) - MIN(tx_date))::numeric / GREATEST(COUNT(*) - 1, 1) AS avg_interval
    FROM base GROUP BY merchant_key
    HAVING COUNT(*) >= 3
  ),
  fil AS (
    SELECT *,
      CASE
        WHEN avg_interval BETWEEN 25 AND 36 THEN 'Månedlig'
        WHEN avg_interval BETWEEN 12 AND 18 THEN 'Halvmånedlig'
        WHEN avg_interval BETWEEN 5 AND 9 THEN 'Ukentlig'
        WHEN avg_interval BETWEEN 80 AND 100 THEN 'Kvartalsvis'
        WHEN avg_interval BETWEEN 170 AND 195 THEN 'Halvårlig'
        WHEN avg_interval BETWEEN 350 AND 380 THEN 'Årlig'
        ELSE NULL
      END AS frequency
    FROM agg
    WHERE COALESCE(amount_sd, 0) <= GREATEST(avg_amount * 0.25, 25)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'merchant', merchant,
    'count', cnt,
    'avg_amount', round(avg_amount, 2),
    'frequency', frequency,
    'interval_days', round(avg_interval, 1),
    'first_date', first_date,
    'last_date', last_date,
    'next_expected', (last_date + (round(avg_interval)::int))::date,
    'yearly_cost', round(avg_amount * (365.0 / GREATEST(avg_interval, 1)), 2)
  ) ORDER BY avg_amount * (365.0 / GREATEST(avg_interval,1)) DESC), '[]'::jsonb)
  INTO v FROM fil WHERE frequency IS NOT NULL;
  RETURN v;
END;
$function$;
ALTER TABLE public.tax_monthly ADD COLUMN IF NOT EXISTS employer text NOT NULL DEFAULT 'Hovedjobb';
ALTER TABLE public.tax_monthly DROP CONSTRAINT IF EXISTS tax_monthly_year_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS tax_monthly_year_month_employer_uniq ON public.tax_monthly (year, month, employer);
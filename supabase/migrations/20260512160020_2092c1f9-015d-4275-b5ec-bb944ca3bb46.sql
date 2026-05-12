
ALTER TABLE public.tax_monthly ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'arne';
ALTER TABLE public.tax_year_settings ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'arne';
ALTER TABLE public.payslip_files ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'arne';

DROP INDEX IF EXISTS public.tax_monthly_year_month_employer_uniq;
CREATE UNIQUE INDEX tax_monthly_profile_year_month_employer_uniq
  ON public.tax_monthly (profile, year, month, employer);

ALTER TABLE public.tax_year_settings DROP CONSTRAINT IF EXISTS tax_year_settings_pkey;
ALTER TABLE public.tax_year_settings ADD CONSTRAINT tax_year_settings_pkey PRIMARY KEY (profile, year);

CREATE INDEX IF NOT EXISTS payslip_files_profile_year_idx
  ON public.payslip_files (profile, year, uploaded_at DESC);


ALTER TABLE public.okonomi_budget_settings
  ADD COLUMN IF NOT EXISTS payday_day integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS household_adults integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS household_children_under18 integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS household_children_over18 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS benchmarks jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS benchmarks_generated_at timestamptz;

INSERT INTO public.okonomi_budget_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

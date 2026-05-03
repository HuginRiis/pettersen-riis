CREATE TABLE public.ai_budget_actual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,
  actual_cost_usd numeric NOT NULL DEFAULT 0,
  monthly_budget_usd numeric NOT NULL DEFAULT 1.0,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_budget_actual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view ai budget actual" ON public.ai_budget_actual FOR SELECT USING (true);
CREATE POLICY "Anyone can insert ai budget actual" ON public.ai_budget_actual FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update ai budget actual" ON public.ai_budget_actual FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete ai budget actual" ON public.ai_budget_actual FOR DELETE USING (true);
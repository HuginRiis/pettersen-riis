CREATE TABLE public.okonomi_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  start_balance numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  monthly_change numeric NOT NULL DEFAULT 0,
  yearly_change numeric NOT NULL DEFAULT 0,
  account_patterns text[] NOT NULL DEFAULT '{}'::text[],
  color text NOT NULL DEFAULT '#f59e0b',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.okonomi_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "okonomi_acc_all_select" ON public.okonomi_accounts FOR SELECT USING (true);
CREATE POLICY "okonomi_acc_all_insert" ON public.okonomi_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "okonomi_acc_all_update" ON public.okonomi_accounts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "okonomi_acc_all_delete" ON public.okonomi_accounts FOR DELETE USING (true);

CREATE TRIGGER okonomi_accounts_set_updated
  BEFORE UPDATE ON public.okonomi_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.okonomi_accounts (slug, name, color, sort_order) VALUES
  ('lonn', 'Lønnskonto', '#10b981', 1),
  ('lan', 'Lånekonto', '#ef4444', 2),
  ('hytte', 'Hyttkonto', '#0ea5e9', 3)
ON CONFLICT (slug) DO NOTHING;
ALTER TABLE public.okonomi_budget_settings
  ADD COLUMN IF NOT EXISTS internal_transfer_filter_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_transfer_accounts text[] NOT NULL DEFAULT '{}';
-- Add fields to receipts for food classification + warranty push notifications
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS is_food boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warranty_recipient text NOT NULL DEFAULT 'Alle',
  ADD COLUMN IF NOT EXISTS warranty_notified_90 timestamptz,
  ADD COLUMN IF NOT EXISTS warranty_notified_60 timestamptz,
  ADD COLUMN IF NOT EXISTS warranty_notified_30 timestamptz;

CREATE INDEX IF NOT EXISTS idx_receipts_is_food ON public.receipts(is_food);
CREATE INDEX IF NOT EXISTS idx_receipts_purchased_at ON public.receipts(purchased_at);
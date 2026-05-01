-- Receipts table
CREATE TABLE public.receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store TEXT,
  purchased_at DATE,
  total_nok NUMERIC,
  currency TEXT NOT NULL DEFAULT 'NOK',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_raw_text TEXT,
  ai_model TEXT,
  notes TEXT,
  image_url TEXT NOT NULL,
  image_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view receipts" ON public.receipts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert receipts" ON public.receipts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update receipts" ON public.receipts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete receipts" ON public.receipts FOR DELETE USING (true);

CREATE TRIGGER receipts_set_updated_at
BEFORE UPDATE ON public.receipts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_receipts_purchased_at ON public.receipts(purchased_at DESC);
CREATE INDEX idx_receipts_store ON public.receipts(store);

-- Storage bucket for receipt images (public so img tags work)
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Receipt images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

CREATE POLICY "Anyone can upload receipt images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Anyone can update receipt images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'receipts');

CREATE POLICY "Anyone can delete receipt images"
ON storage.objects FOR DELETE
USING (bucket_id = 'receipts');
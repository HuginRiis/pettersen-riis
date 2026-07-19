CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('utlan','lant')),
  item TEXT NOT NULL,
  person TEXT NOT NULL,
  notes TEXT,
  lent_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return DATE,
  returned_at DATE,
  image_url TEXT,
  image_path TEXT,
  added_by TEXT NOT NULL DEFAULT 'Alle',
  recipient TEXT NOT NULL DEFAULT 'Alle',
  reminder_sent_at TIMESTAMPTZ,
  overdue_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated, anon;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view loans" ON public.loans FOR SELECT USING (true);
CREATE POLICY "Anyone can insert loans" ON public.loans FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update loans" ON public.loans FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete loans" ON public.loans FOR DELETE USING (true);
CREATE TRIGGER loans_set_updated_at BEFORE UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_loans_direction ON public.loans(direction);
CREATE INDEX idx_loans_expected_return ON public.loans(expected_return);
CREATE INDEX idx_loans_returned_at ON public.loans(returned_at);

CREATE POLICY "Loan images are publicly accessible"
ON storage.objects FOR SELECT USING (bucket_id = 'loans');
CREATE POLICY "Anyone can upload loan images"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'loans');
CREATE POLICY "Anyone can update loan images"
ON storage.objects FOR UPDATE USING (bucket_id = 'loans');
CREATE POLICY "Anyone can delete loan images"
ON storage.objects FOR DELETE USING (bucket_id = 'loans');
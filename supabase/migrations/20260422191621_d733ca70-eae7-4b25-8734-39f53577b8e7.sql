
CREATE TABLE public.hytta_checklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  added_by TEXT NOT NULL DEFAULT 'Alle',
  checked BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.hytta_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view hytta checklist"
  ON public.hytta_checklist FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert hytta checklist"
  ON public.hytta_checklist FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update hytta checklist"
  ON public.hytta_checklist FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete hytta checklist"
  ON public.hytta_checklist FOR DELETE
  USING (true);

CREATE OR REPLACE FUNCTION public.update_hytta_checklist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER hytta_checklist_updated_at
  BEFORE UPDATE ON public.hytta_checklist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_hytta_checklist_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.hytta_checklist;

CREATE TABLE public.changelog_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view changelog" ON public.changelog_entries FOR SELECT USING (true);
CREATE POLICY "Anyone can insert changelog" ON public.changelog_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update changelog" ON public.changelog_entries FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete changelog" ON public.changelog_entries FOR DELETE USING (true);

CREATE INDEX idx_changelog_changed_at ON public.changelog_entries (changed_at DESC);
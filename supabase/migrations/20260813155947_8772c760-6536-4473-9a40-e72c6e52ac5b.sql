CREATE TABLE public.manuals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text,
  model text,
  category text,
  source_url text,
  file_path text,
  file_size integer,
  notes text,
  tags text[] not null default '{}',
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manuals TO authenticated;
GRANT ALL ON public.manuals TO service_role;

ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read manuals" ON public.manuals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert manuals" ON public.manuals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update manuals" ON public.manuals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete manuals" ON public.manuals FOR DELETE TO authenticated USING (true);

CREATE INDEX manuals_title_idx ON public.manuals (lower(title));

CREATE TRIGGER update_manuals_updated_at BEFORE UPDATE ON public.manuals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated can read manual files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'manuals');
CREATE POLICY "Authenticated can upload manual files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'manuals');
CREATE POLICY "Authenticated can delete manual files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'manuals');
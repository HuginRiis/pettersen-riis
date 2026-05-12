CREATE TABLE IF NOT EXISTS public.payslip_files (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int,
  employer text,
  file_path text not null,
  file_url text not null,
  original_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS payslip_files_year_idx ON public.payslip_files (year, uploaded_at DESC);

ALTER TABLE public.payslip_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payslip_files read" ON public.payslip_files FOR SELECT USING (true);
CREATE POLICY "payslip_files write" ON public.payslip_files FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "payslips public read" ON storage.objects FOR SELECT USING (bucket_id = 'payslips');
CREATE POLICY "payslips public write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payslips');
CREATE POLICY "payslips public update" ON storage.objects FOR UPDATE USING (bucket_id = 'payslips');
CREATE POLICY "payslips public delete" ON storage.objects FOR DELETE USING (bucket_id = 'payslips');
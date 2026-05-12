ALTER TABLE public.payslip_files
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;
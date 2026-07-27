
ALTER TABLE public.garmin_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS no_client_access_garmin_tokens ON public.garmin_tokens;
CREATE POLICY no_client_access_garmin_tokens ON public.garmin_tokens
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

ALTER TABLE public.roborock_auth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS no_client_access_roborock_auth ON public.roborock_auth;
CREATE POLICY no_client_access_roborock_auth ON public.roborock_auth
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Anyone can insert agenda" ON public.agenda_messages;
DROP POLICY IF EXISTS "Anyone can delete agenda" ON public.agenda_messages;

DROP POLICY IF EXISTS "payslip_files read" ON public.payslip_files;
DROP POLICY IF EXISTS "payslip_files write" ON public.payslip_files;
CREATE POLICY no_client_access_payslip_files ON public.payslip_files
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Anyone can delete loan images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update loan images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload loan images" ON storage.objects;
DROP POLICY IF EXISTS "Loan images are publicly accessible" ON storage.objects;

DROP POLICY IF EXISTS "payslips public delete" ON storage.objects;
DROP POLICY IF EXISTS "payslips public read" ON storage.objects;
DROP POLICY IF EXISTS "payslips public update" ON storage.objects;
DROP POLICY IF EXISTS "payslips public write" ON storage.objects;

-- Policies for renovation_projects
CREATE POLICY "Anyone can view renovation projects"
  ON public.renovation_projects FOR SELECT USING (true);
CREATE POLICY "Anyone can insert renovation projects"
  ON public.renovation_projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update renovation projects"
  ON public.renovation_projects FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete renovation projects"
  ON public.renovation_projects FOR DELETE USING (true);

-- Policies for renovation_tasks
CREATE POLICY "Anyone can view renovation tasks"
  ON public.renovation_tasks FOR SELECT USING (true);
CREATE POLICY "Anyone can insert renovation tasks"
  ON public.renovation_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update renovation tasks"
  ON public.renovation_tasks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete renovation tasks"
  ON public.renovation_tasks FOR DELETE USING (true);

-- Policies for renovation_images
CREATE POLICY "Anyone can view renovation images"
  ON public.renovation_images FOR SELECT USING (true);
CREATE POLICY "Anyone can insert renovation images"
  ON public.renovation_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update renovation images"
  ON public.renovation_images FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete renovation images"
  ON public.renovation_images FOR DELETE USING (true);

-- Storage policies for renovation bucket (insert/update/delete — read er allerede satt)
CREATE POLICY "Anyone can upload renovation images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'renovation');
CREATE POLICY "Anyone can update renovation images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'renovation');
CREATE POLICY "Anyone can delete renovation images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'renovation');
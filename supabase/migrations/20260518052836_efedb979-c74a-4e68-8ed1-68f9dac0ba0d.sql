
-- plants
CREATE TABLE public.plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  species_common text,
  species_latin text,
  kind text NOT NULL DEFAULT 'plante',
  edible boolean,
  toxicity text NOT NULL DEFAULT 'unknown',
  toxicity_notes text,
  care_summary text,
  where_grows text,
  watering_days_interval integer,
  fertilize_weeks_interval integer,
  season_start_month integer,
  season_end_month integer,
  miflora_device_id text,
  miflora_device_name text,
  soil_moisture_min integer,
  soil_moisture_max integer,
  light_lux_min integer,
  temp_min numeric,
  temp_max numeric,
  fertility_min integer,
  notify_watering boolean NOT NULL DEFAULT false,
  notify_fertilize boolean NOT NULL DEFAULT false,
  notify_sensor boolean NOT NULL DEFAULT false,
  notify_season boolean NOT NULL DEFAULT false,
  notify_recipient text NOT NULL DEFAULT 'Alle',
  last_watered_at timestamptz,
  last_fertilized_at timestamptz,
  cover_photo_url text,
  ai_reference_image_url text,
  ai_raw jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view plants" ON public.plants FOR SELECT USING (true);
CREATE POLICY "Anyone can insert plants" ON public.plants FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update plants" ON public.plants FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete plants" ON public.plants FOR DELETE USING (true);

CREATE TRIGGER plants_updated_at BEFORE UPDATE ON public.plants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- plant_photos
CREATE TABLE public.plant_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  lat numeric,
  lon numeric,
  location_label text,
  is_ai_generated boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plant_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view plant photos" ON public.plant_photos FOR SELECT USING (true);
CREATE POLICY "Anyone can insert plant photos" ON public.plant_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update plant photos" ON public.plant_photos FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete plant photos" ON public.plant_photos FOR DELETE USING (true);

CREATE INDEX plant_photos_plant_id_idx ON public.plant_photos(plant_id);

-- plant_notification_log
CREATE TABLE public.plant_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  detail text
);

ALTER TABLE public.plant_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view plant notif log" ON public.plant_notification_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert plant notif log" ON public.plant_notification_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete plant notif log" ON public.plant_notification_log FOR DELETE USING (true);

CREATE INDEX plant_notif_log_plant_idx ON public.plant_notification_log(plant_id, kind, notified_at DESC);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('plants', 'plants', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Plant images public read" ON storage.objects FOR SELECT USING (bucket_id = 'plants');
CREATE POLICY "Anyone can upload plant images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'plants');
CREATE POLICY "Anyone can update plant images" ON storage.objects FOR UPDATE USING (bucket_id = 'plants');
CREATE POLICY "Anyone can delete plant images" ON storage.objects FOR DELETE USING (bucket_id = 'plants');

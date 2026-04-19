-- Tabell for renoveringsprosjekter (både borg og hytte)
CREATE TABLE public.renovation_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location TEXT NOT NULL CHECK (location IN ('borg', 'hytta')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planlagt' CHECK (status IN ('planlagt', 'pagaende', 'ferdig')),
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sjekkliste-elementer per prosjekt
CREATE TABLE public.renovation_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.renovation_projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bilder per prosjekt
CREATE TABLE public.renovation_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.renovation_projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_renovation_projects_location ON public.renovation_projects(location);
CREATE INDEX idx_renovation_tasks_project ON public.renovation_tasks(project_id);
CREATE INDEX idx_renovation_images_project ON public.renovation_images(project_id);

-- RLS — privat familie-app, all tilgang via server-side service role.
ALTER TABLE public.renovation_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renovation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renovation_images ENABLE ROW LEVEL SECURITY;

-- Ingen public policies — kun server-side (service role) får tilgang.
-- Dette matcher mønsteret i agenda_messages (privat familie-app).

-- Storage bucket for prosjektbilder
INSERT INTO storage.buckets (id, name, public)
VALUES ('renovation', 'renovation', true)
ON CONFLICT (id) DO NOTHING;

-- Public read av bilder (de er ment å vises i appen)
CREATE POLICY "Renovation images are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'renovation');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_renovation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER renovation_projects_updated_at
BEFORE UPDATE ON public.renovation_projects
FOR EACH ROW
EXECUTE FUNCTION public.set_renovation_updated_at();
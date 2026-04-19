
-- 1) Homey rooms cache
CREATE TABLE public.homey_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL CHECK (location IN ('borg','hytta')),
  homey_zone_id text NOT NULL,
  name text NOT NULL,
  parent_zone_id text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location, homey_zone_id)
);

ALTER TABLE public.homey_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view homey rooms" ON public.homey_rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can insert homey rooms" ON public.homey_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update homey rooms" ON public.homey_rooms FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete homey rooms" ON public.homey_rooms FOR DELETE USING (true);

CREATE INDEX idx_homey_rooms_location ON public.homey_rooms(location);

-- 2) Utvid renovation_projects
ALTER TABLE public.renovation_projects
  ADD COLUMN room_name text,
  ADD COLUMN homey_zone_id text,
  ADD COLUMN category text NOT NULL DEFAULT 'annet',
  ADD COLUMN priority text NOT NULL DEFAULT 'middels',
  ADD COLUMN planned_start date,
  ADD COLUMN planned_end date,
  ADD COLUMN completed_at date,
  ADD COLUMN budget_nok numeric(12,2) DEFAULT 0,
  ADD COLUMN notes text;

-- 3) Kostnader (linjeposter)
CREATE TABLE public.renovation_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.renovation_projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount_nok numeric(12,2) NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'materialer',
  cost_date date NOT NULL DEFAULT (now()::date),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.renovation_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view renovation costs" ON public.renovation_costs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert renovation costs" ON public.renovation_costs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update renovation costs" ON public.renovation_costs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete renovation costs" ON public.renovation_costs FOR DELETE USING (true);
CREATE INDEX idx_renovation_costs_project ON public.renovation_costs(project_id);

-- 4) Håndverkere
CREATE TABLE public.renovation_contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.renovation_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone text,
  email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.renovation_contractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view renovation contractors" ON public.renovation_contractors FOR SELECT USING (true);
CREATE POLICY "Anyone can insert renovation contractors" ON public.renovation_contractors FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update renovation contractors" ON public.renovation_contractors FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete renovation contractors" ON public.renovation_contractors FOR DELETE USING (true);
CREATE INDEX idx_renovation_contractors_project ON public.renovation_contractors(project_id);

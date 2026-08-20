ALTER TABLE public.kosthold_meals
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS ai_notes text,
  ADD COLUMN IF NOT EXISTS added_by text;

CREATE TABLE IF NOT EXISTS public.kosthold_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person text NOT NULL UNIQUE,
  plan_type text NOT NULL DEFAULT 'Vedlikehold',
  calorie_goal integer NOT NULL DEFAULT 2200,
  protein_goal integer NOT NULL DEFAULT 130,
  carbs_goal integer NOT NULL DEFAULT 230,
  fat_goal integer NOT NULL DEFAULT 70,
  fiber_goal integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.kosthold_goals TO service_role;
ALTER TABLE public.kosthold_goals ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS kosthold_goals_updated_at ON public.kosthold_goals;
CREATE TRIGGER kosthold_goals_updated_at BEFORE UPDATE ON public.kosthold_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
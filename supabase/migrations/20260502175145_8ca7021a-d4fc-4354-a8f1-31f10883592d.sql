-- Tabell for kameradeteksjoner (Eufy via Home Assistant webhook m.fl.)
CREATE TABLE public.vakttarn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('person','dyr','bil','pakke','annet')),
  camera text,
  source text NOT NULL DEFAULT 'eufy',
  detected_at timestamptz NOT NULL DEFAULT now(),
  confidence numeric,
  snapshot_url text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vakttarn_events_detected_at ON public.vakttarn_events (detected_at DESC);
CREATE INDEX idx_vakttarn_events_category_detected ON public.vakttarn_events (category, detected_at DESC);

ALTER TABLE public.vakttarn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view vakttarn events"
  ON public.vakttarn_events FOR SELECT USING (true);

CREATE POLICY "Anyone can insert vakttarn events"
  ON public.vakttarn_events FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete vakttarn events"
  ON public.vakttarn_events FOR DELETE USING (true);
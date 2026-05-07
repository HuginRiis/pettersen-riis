ALTER TABLE public.met_alert_notification_prefs
ADD COLUMN IF NOT EXISTS colors text[] NOT NULL DEFAULT ARRAY['Yellow','Orange','Red'];

-- Migrer eksisterende min_color → colors (som inkluderer alle farger fra min nivå og oppover)
UPDATE public.met_alert_notification_prefs
SET colors = CASE
  WHEN min_color = 'Yellow' THEN ARRAY['Yellow','Orange','Red']
  WHEN min_color = 'Orange' THEN ARRAY['Orange','Red']
  WHEN min_color = 'Red'    THEN ARRAY['Red']
  ELSE ARRAY['Yellow','Orange','Red']
END
WHERE colors = ARRAY['Yellow','Orange','Red']::text[];
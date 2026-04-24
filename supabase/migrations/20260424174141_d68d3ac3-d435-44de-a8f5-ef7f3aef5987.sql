CREATE TABLE public.birthdays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  title TEXT,
  words TEXT,
  notify_enabled BOOLEAN NOT NULL DEFAULT true,
  notify_recipients TEXT[] NOT NULL DEFAULT ARRAY['Alle']::TEXT[],
  notified_year INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.birthdays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view birthdays" ON public.birthdays FOR SELECT USING (true);
CREATE POLICY "Anyone can insert birthdays" ON public.birthdays FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update birthdays" ON public.birthdays FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete birthdays" ON public.birthdays FOR DELETE USING (true);

CREATE TRIGGER update_birthdays_updated_at
BEFORE UPDATE ON public.birthdays
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.birthdays (name, birth_date, title, words, notify_enabled, notify_recipients) VALUES
  ('Arne',    '1973-04-19', 'Lord av Skien',          'Med ære og ravner',         true, ARRAY['Alle']),
  ('Rebekka', '1981-11-30', 'Lady av Skien',          'Sterk som vinterstormen',   true, ARRAY['Alle']),
  ('Marita',  '2004-04-19', 'Den andre datter',       'Ætt av sommerlys',          true, ARRAY['Alle']),
  ('Celine',  '2004-11-09', 'Den røde flamme',        'Ild av Skien',              true, ARRAY['Alle']),
  ('Nora',    '2001-09-11', 'Den første datter',      'Stille som måneskinn',      true, ARRAY['Alle']),
  ('Mira',    '2023-05-17', 'Avkommet til Nora',      'Liten løve',                true, ARRAY['Alle']);
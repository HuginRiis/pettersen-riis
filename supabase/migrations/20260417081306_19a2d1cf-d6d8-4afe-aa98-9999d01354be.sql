-- Shared family agenda messages (no auth required - private family site)
CREATE TABLE public.agenda_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT,
  event_date DATE NOT NULL,
  who TEXT NOT NULL DEFAULT 'Begge',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_messages ENABLE ROW LEVEL SECURITY;

-- Family site - open access (no auth)
CREATE POLICY "Anyone can view agenda" ON public.agenda_messages FOR SELECT USING (true);
CREATE POLICY "Anyone can insert agenda" ON public.agenda_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete agenda" ON public.agenda_messages FOR DELETE USING (true);

CREATE INDEX idx_agenda_event_date ON public.agenda_messages(event_date);
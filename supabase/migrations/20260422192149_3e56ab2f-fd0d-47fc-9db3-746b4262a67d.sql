
ALTER TABLE public.hytta_checklist
  ADD COLUMN notify_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN notified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_hytta_checklist_notify_at
  ON public.hytta_checklist(notify_at)
  WHERE notify_at IS NOT NULL AND notified_at IS NULL;

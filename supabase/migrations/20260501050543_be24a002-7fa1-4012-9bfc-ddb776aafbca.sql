ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
ALTER TABLE public.receipts REPLICA IDENTITY FULL;
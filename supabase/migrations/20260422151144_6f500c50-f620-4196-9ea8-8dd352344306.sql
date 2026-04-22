ALTER TABLE public.agenda_messages
  ADD COLUMN IF NOT EXISTS event_time time without time zone,
  ADD COLUMN IF NOT EXISTS notify_minutes_before integer,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  who text NOT NULL DEFAULT 'Alle',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view push subscriptions"
  ON public.push_subscriptions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert push subscriptions"
  ON public.push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update push subscriptions"
  ON public.push_subscriptions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete push subscriptions"
  ON public.push_subscriptions FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS push_subscriptions_who_idx ON public.push_subscriptions(who);
CREATE INDEX IF NOT EXISTS agenda_messages_pending_idx
  ON public.agenda_messages(event_date, event_time)
  WHERE notified_at IS NULL AND notify_minutes_before IS NOT NULL;


-- home_alarm_log: fjern offentlige skriveregler
DROP POLICY IF EXISTS "Anyone can insert home alarm log" ON public.home_alarm_log;
DROP POLICY IF EXISTS "Anyone can delete home alarm log" ON public.home_alarm_log;

-- push_subscriptions: fjern offentlige skriveregler
DROP POLICY IF EXISTS "Anyone can insert push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can update push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can delete push subscriptions" ON public.push_subscriptions;

-- agenda_messages: fjern eventuelle gjenværende permissive skriveregler
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agenda_messages'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.agenda_messages', r.policyname);
  END LOOP;
END $$;

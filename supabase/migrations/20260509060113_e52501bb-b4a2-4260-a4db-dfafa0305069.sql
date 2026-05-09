CREATE TABLE public.login_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL DEFAULT 'Alle',
  enabled boolean NOT NULL DEFAULT true,
  notify_on_success boolean NOT NULL DEFAULT true,
  notify_on_failure boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.login_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_prefs_read_all" ON public.login_notification_prefs FOR SELECT USING (true);
CREATE POLICY "login_prefs_insert_all" ON public.login_notification_prefs FOR INSERT WITH CHECK (true);
CREATE POLICY "login_prefs_update_all" ON public.login_notification_prefs FOR UPDATE USING (true);
CREATE POLICY "login_prefs_delete_all" ON public.login_notification_prefs FOR DELETE USING (true);

CREATE TRIGGER set_login_notification_prefs_updated_at
BEFORE UPDATE ON public.login_notification_prefs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.login_notification_prefs (recipient, enabled, notify_on_success, notify_on_failure)
VALUES ('Arne', true, true, true);
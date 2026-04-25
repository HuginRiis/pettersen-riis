-- Track which person (who) is responsible for each login attempt and visitor session
ALTER TABLE public.visitor_login_attempts ADD COLUMN IF NOT EXISTS who text;
ALTER TABLE public.visitor_sessions ADD COLUMN IF NOT EXISTS who text;

CREATE INDEX IF NOT EXISTS idx_login_attempts_who ON public.visitor_login_attempts (who, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_who ON public.visitor_sessions (who, last_seen_at DESC);
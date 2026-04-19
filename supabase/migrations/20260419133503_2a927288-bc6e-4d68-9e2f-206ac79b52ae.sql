-- Visitor sessions: én rad pr. nettleser-økt
CREATE TABLE public.visitor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_session_id TEXT NOT NULL UNIQUE,
  ip TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  country_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  timezone TEXT,
  isp TEXT,
  user_agent TEXT,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  referrer TEXT,
  language TEXT,
  screen TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  pageview_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_visitor_sessions_started_at ON public.visitor_sessions (started_at DESC);
CREATE INDEX idx_visitor_sessions_last_seen ON public.visitor_sessions (last_seen_at DESC);
CREATE INDEX idx_visitor_sessions_country ON public.visitor_sessions (country);

ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visitor sessions" ON public.visitor_sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert visitor sessions" ON public.visitor_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update visitor sessions" ON public.visitor_sessions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete visitor sessions" ON public.visitor_sessions FOR DELETE USING (true);

-- Page views
CREATE TABLE public.visitor_pageviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.visitor_sessions(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  title TEXT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_visitor_pageviews_session ON public.visitor_pageviews (session_id);
CREATE INDEX idx_visitor_pageviews_entered ON public.visitor_pageviews (entered_at DESC);
CREATE INDEX idx_visitor_pageviews_path ON public.visitor_pageviews (path);

ALTER TABLE public.visitor_pageviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pageviews" ON public.visitor_pageviews FOR SELECT USING (true);
CREATE POLICY "Anyone can insert pageviews" ON public.visitor_pageviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update pageviews" ON public.visitor_pageviews FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete pageviews" ON public.visitor_pageviews FOR DELETE USING (true);

-- Login attempts
CREATE TABLE public.visitor_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false,
  ip TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  country_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  user_agent TEXT,
  device_type TEXT,
  os TEXT,
  browser TEXT
);

CREATE INDEX idx_visitor_login_attempts_at ON public.visitor_login_attempts (attempted_at DESC);
CREATE INDEX idx_visitor_login_attempts_success ON public.visitor_login_attempts (success);

ALTER TABLE public.visitor_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view login attempts" ON public.visitor_login_attempts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert login attempts" ON public.visitor_login_attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete login attempts" ON public.visitor_login_attempts FOR DELETE USING (true);
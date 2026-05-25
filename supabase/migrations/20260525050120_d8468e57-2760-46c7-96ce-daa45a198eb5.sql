
CREATE OR REPLACE FUNCTION public.get_api_call_summary_24h()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_rows jsonb;
  v_recent jsonb;
BEGIN
  WITH base AS (
    SELECT
      *,
      CASE
        WHEN endpoint ~* '(token|oauth|login|signin|sign_in|refresh|password|auth)' THEN 'auth'
        WHEN metadata->>'path' IS NULL OR metadata->>'path' = '' THEN 'cron'
        WHEN (metadata->>'path') ~* '^/(api|hooks)/' THEN 'cron'
        ELSE 'ondemand'
      END AS kind
    FROM public.api_call_log
    WHERE called_at > now() - interval '24 hours'
  ),
  agg AS (
    SELECT
      source,
      endpoint,
      COUNT(*) AS total_24h,
      COUNT(*) FILTER (WHERE NOT ok) AS errors_24h,
      COUNT(*) FILTER (WHERE kind = 'ondemand') AS ondemand_24h,
      COUNT(*) FILTER (WHERE kind = 'cron') AS cron_24h,
      COUNT(*) FILTER (WHERE kind = 'auth') AS auth_24h,
      AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_duration_ms_24h
    FROM base
    GROUP BY source, endpoint
  ),
  last_per AS (
    SELECT DISTINCT ON (source, endpoint)
      source, endpoint,
      called_at AS last_called_at,
      ok AS last_ok,
      duration_ms AS last_duration_ms,
      error_message AS last_error,
      cached AS last_cached
    FROM base
    ORDER BY source, endpoint, called_at DESC
  )
  SELECT jsonb_agg(jsonb_build_object(
    'source', a.source,
    'endpoint', a.endpoint,
    'total_24h', a.total_24h,
    'errors_24h', a.errors_24h,
    'ondemand_24h', a.ondemand_24h,
    'cron_24h', a.cron_24h,
    'auth_24h', a.auth_24h,
    'avg_duration_ms_24h', CASE WHEN a.avg_duration_ms_24h IS NULL THEN NULL ELSE ROUND(a.avg_duration_ms_24h)::int END,
    'last_called_at', l.last_called_at,
    'last_ok', l.last_ok,
    'last_duration_ms', l.last_duration_ms,
    'last_error', l.last_error,
    'last_cached', COALESCE(l.last_cached, false)
  )) INTO v_rows
  FROM agg a
  LEFT JOIN last_per l USING (source, endpoint);

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'source', source,
    'endpoint', endpoint,
    'ok', ok,
    'duration_ms', duration_ms,
    'error_message', error_message,
    'cached', cached,
    'called_at', called_at
  ) ORDER BY called_at DESC)
  INTO v_recent
  FROM (
    SELECT id, source, endpoint, ok, duration_ms, error_message, cached, called_at
    FROM public.api_call_log
    WHERE called_at > now() - interval '24 hours'
    ORDER BY called_at DESC
    LIMIT 50
  ) r;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'recent', COALESCE(v_recent, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_api_call_hourly_24h()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_hourly jsonb;
  v_pages jsonb;
  v_yesterday jsonb;
BEGIN
  WITH base AS (
    SELECT * FROM public.api_call_log
    WHERE called_at > now() - interval '24 hours'
  ),
  hours AS (
    SELECT generate_series(
      date_trunc('hour', now() - interval '23 hours'),
      date_trunc('hour', now()),
      interval '1 hour'
    ) AS hour
  ),
  per_hour AS (
    SELECT
      date_trunc('hour', called_at) AS hour,
      source,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE NOT ok) AS errors
    FROM base
    GROUP BY 1, 2
  ),
  hourly_rows AS (
    SELECT h.hour, COALESCE(p.source, '') AS source,
           COALESCE(p.total, 0) AS total,
           COALESCE(p.errors, 0) AS errors
    FROM hours h
    LEFT JOIN per_hour p ON p.hour = h.hour
  ),
  pages AS (
    SELECT
      source,
      COALESCE(NULLIF(metadata->>'path', ''), NULLIF(metadata->>'page', ''), '(server / cron)') AS page,
      COUNT(*) AS total,
      MAX(called_at) AS last_at
    FROM base
    GROUP BY source, page
  ),
  yest_per_hour AS (
    SELECT
      date_trunc('hour', called_at) AS hour,
      COUNT(*) AS total
    FROM public.api_call_log
    WHERE called_at > now() - interval '48 hours'
      AND called_at <= now() - interval '24 hours'
    GROUP BY 1
  ),
  yest_rows AS (
    SELECT
      h.hour AS today_hour,
      (h.hour - interval '24 hours') AS yest_hour,
      COALESCE(y.total, 0) AS yest_total
    FROM hours h
    LEFT JOIN yest_per_hour y ON y.hour = (h.hour - interval '24 hours')
  )
  SELECT
    (SELECT jsonb_agg(jsonb_build_object(
        'hour', hour,
        'source', source,
        'total', total,
        'errors', errors
      ) ORDER BY hour) FROM hourly_rows),
    (SELECT jsonb_agg(jsonb_build_object(
        'source', source,
        'page', page,
        'total', total,
        'last_at', last_at
      ) ORDER BY source, total DESC) FROM pages),
    (SELECT jsonb_agg(jsonb_build_object(
        'hour', today_hour,
        'yest_total', yest_total
      ) ORDER BY today_hour) FROM yest_rows)
  INTO v_hourly, v_pages, v_yesterday;

  RETURN jsonb_build_object(
    'hourly', COALESCE(v_hourly, '[]'::jsonb),
    'pages',  COALESCE(v_pages,  '[]'::jsonb),
    'yesterday', COALESCE(v_yesterday, '[]'::jsonb)
  );
END;
$function$;

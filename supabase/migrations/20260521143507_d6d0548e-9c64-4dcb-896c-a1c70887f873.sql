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
    SELECT *
    FROM public.api_call_log
    WHERE called_at > now() - interval '24 hours'
  ),
  agg AS (
    SELECT
      source,
      endpoint,
      COUNT(*) AS total_24h,
      COUNT(*) FILTER (WHERE NOT ok) AS errors_24h,
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
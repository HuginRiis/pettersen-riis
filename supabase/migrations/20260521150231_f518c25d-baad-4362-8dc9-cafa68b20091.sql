CREATE OR REPLACE FUNCTION public.get_api_call_hourly_24h()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_hourly jsonb;
  v_pages jsonb;
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
      ) ORDER BY source, total DESC) FROM pages)
  INTO v_hourly, v_pages;

  RETURN jsonb_build_object(
    'hourly', COALESCE(v_hourly, '[]'::jsonb),
    'pages',  COALESCE(v_pages,  '[]'::jsonb)
  );
END;
$function$;
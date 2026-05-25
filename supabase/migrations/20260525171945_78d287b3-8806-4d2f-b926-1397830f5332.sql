CREATE OR REPLACE FUNCTION public.get_db_30day_cleanup_estimate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'information_schema', 'cron'
AS $function$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
  r record;
  v_count bigint;
  v_total_rows bigint;
  v_bytes bigint;
  v_estimated bigint;
  v_cutoff timestamptz := now() - interval '30 days';
  v_date_col text;
  v_cron_bytes bigint := 0;
  v_cron_rows bigint := 0;
BEGIN
  -- Loop over every public table and pick the best timestamp column.
  FOR r IN
    SELECT c.relname AS tbl, c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    -- Pick the most likely "created/event timestamp" column.
    SELECT column_name INTO v_date_col
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = r.tbl
      AND data_type IN ('timestamp with time zone','timestamp without time zone','date')
    ORDER BY
      CASE column_name
        WHEN 'created_at' THEN 1
        WHEN 'called_at' THEN 2
        WHEN 'ts' THEN 3
        WHEN 'sent_at' THEN 4
        WHEN 'notified_at' THEN 5
        WHEN 'attempted_at' THEN 6
        WHEN 'detected_at' THEN 7
        WHEN 'ran_at' THEN 8
        WHEN 'changed_at' THEN 9
        WHEN 'updated_at' THEN 10
        WHEN 'occurred_at' THEN 11
        WHEN 'event_at' THEN 12
        ELSE 99
      END
    LIMIT 1;

    IF v_date_col IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I < $1', r.tbl, v_date_col)
        INTO v_count USING v_cutoff;
      EXECUTE format('SELECT count(*) FROM public.%I', r.tbl) INTO v_total_rows;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_count = 0 OR v_total_rows = 0 THEN
      CONTINUE;
    END IF;

    v_bytes := pg_total_relation_size(r.oid);
    v_estimated := (v_bytes::numeric * v_count / v_total_rows)::bigint;
    v_total := v_total + v_estimated;

    v_rows := v_rows || jsonb_build_object(
      'table', r.tbl,
      'date_column', v_date_col,
      'old_rows', v_count,
      'total_rows', v_total_rows,
      'estimated_bytes', v_estimated
    );
  END LOOP;

  -- Include cron.job_run_details (history of cron runs).
  BEGIN
    SELECT count(*) INTO v_cron_rows FROM cron.job_run_details WHERE start_time < v_cutoff;
    IF v_cron_rows > 0 THEN
      v_cron_bytes := pg_total_relation_size('cron.job_run_details'::regclass);
      DECLARE v_total_cron bigint;
      BEGIN
        SELECT count(*) INTO v_total_cron FROM cron.job_run_details;
        IF v_total_cron > 0 THEN
          v_cron_bytes := (v_cron_bytes::numeric * v_cron_rows / v_total_cron)::bigint;
          v_total := v_total + v_cron_bytes;
          v_rows := v_rows || jsonb_build_object(
            'table', 'cron.job_run_details',
            'date_column', 'start_time',
            'old_rows', v_cron_rows,
            'total_rows', v_total_cron,
            'estimated_bytes', v_cron_bytes
          );
        END IF;
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'total_bytes', v_total,
    'db_bytes', pg_database_size(current_database()),
    'rows', v_rows
  );
END;
$function$;

-- Bredere "kjør" som faktisk sletter alt eldre enn 30 dager fra alle public-tabeller.
CREATE OR REPLACE FUNCTION public.run_db_30day_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'information_schema', 'cron'
AS $function$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
  r record;
  v_deleted bigint;
  v_cutoff timestamptz := now() - interval '30 days';
  v_date_col text;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    SELECT column_name INTO v_date_col
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = r.tbl
      AND data_type IN ('timestamp with time zone','timestamp without time zone','date')
    ORDER BY
      CASE column_name
        WHEN 'created_at' THEN 1
        WHEN 'called_at' THEN 2
        WHEN 'ts' THEN 3
        WHEN 'sent_at' THEN 4
        WHEN 'notified_at' THEN 5
        WHEN 'attempted_at' THEN 6
        WHEN 'detected_at' THEN 7
        WHEN 'ran_at' THEN 8
        WHEN 'changed_at' THEN 9
        WHEN 'updated_at' THEN 10
        WHEN 'occurred_at' THEN 11
        WHEN 'event_at' THEN 12
        ELSE 99
      END
    LIMIT 1;

    IF v_date_col IS NULL THEN CONTINUE; END IF;

    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE %I < $1', r.tbl, v_date_col) USING v_cutoff;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_deleted > 0 THEN
      v_total := v_total + v_deleted;
      v_rows := v_rows || jsonb_build_object('table', r.tbl, 'deleted', v_deleted);
    END IF;
  END LOOP;

  -- Også cron.job_run_details
  BEGIN
    DELETE FROM cron.job_run_details WHERE start_time < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      v_total := v_total + v_deleted;
      v_rows := v_rows || jsonb_build_object('table', 'cron.job_run_details', 'deleted', v_deleted);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('total_deleted', v_total, 'rows', v_rows);
END;
$function$;
UPDATE public.garmin_daily_stats
SET endurance_contributors = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'group' = 'RUNNING_GROUP' THEN jsonb_set(elem, '{group}', '"CYCLING_GROUP"')
      ELSE elem
    END
    ORDER BY (elem->>'contribution')::numeric DESC
  )
  FROM jsonb_array_elements(endurance_contributors) AS elem
)
WHERE endurance_contributors IS NOT NULL
  AND endurance_contributors @> '[{"group":"RUNNING_GROUP"}]'::jsonb;
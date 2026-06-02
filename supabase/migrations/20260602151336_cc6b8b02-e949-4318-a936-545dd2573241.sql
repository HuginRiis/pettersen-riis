DELETE FROM public.api_call_log
WHERE endpoint IN (
  'open-meteo:uv',
  'open-meteo:air-quality',
  'open-meteo:panel',
  'open-meteo:pollen',
  'open-meteo:uv-cloud:aq',
  'open-meteo:uv-cloud:forecast'
);
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fjern eksisterende job om den finnes (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('snapshot-tibber-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'snapshot-tibber-daily',
  '50 22 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--dc80f3f8-2238-416c-97d8-0564a088e7cb.lovable.app/api/public/hooks/snapshot-tibber-daily',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
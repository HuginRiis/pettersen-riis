SELECT cron.unschedule('eufy-poll-every-minute');
SELECT cron.schedule(
  'eufy-poll-every-2min',
  '*/2 * * * *',
  $$SELECT net.http_post(
    url := 'https://project--dc80f3f8-2238-416c-97d8-0564a088e7cb.lovable.app/api/public/hooks/eufy-poll',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);
-- Oppdater pollings-vinduer: aktiv 06:30–21:00 Oslo (UTC+1/+2).
-- Vi bruker UTC 04:30–20:00 for å dekke både sommer- og vintertid.

-- Strava: hver 30. min
SELECT cron.unschedule('strava-poll-30min');
SELECT cron.schedule(
  'strava-poll-30min',
  '0,30 4-19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--dc80f3f8-2238-416c-97d8-0564a088e7cb.lovable.app/api/public/hooks/strava-poll',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlZmdueG9sbm9keHNtZmt0bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTM5MjksImV4cCI6MjA5MTk2OTkyOX0.MfI7Y6xfM_eSayT24ezIiwRd9w1gZLPXlPxX3-39KLE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Gardena/Husqvarna: hver 40. min (cron-tilnærming: minutt 0 og 40 hver time = 40/20-mønster)
SELECT cron.unschedule('gardena-poll-30min');
SELECT cron.schedule(
  'gardena-poll-40min',
  '0,40 4-19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--dc80f3f8-2238-416c-97d8-0564a088e7cb.lovable.app/api/public/hooks/gardena-poll',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlZmdueG9sbm9keHNtZmt0bG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTM5MjksImV4cCI6MjA5MTk2OTkyOX0.MfI7Y6xfM_eSayT24ezIiwRd9w1gZLPXlPxX3-39KLE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
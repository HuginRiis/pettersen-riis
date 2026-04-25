-- Backfill `who` from existing IP→user mapping so historical data is attributable.
UPDATE public.visitor_sessions vs
SET who = m.who
FROM public.ip_user_mapping m
WHERE vs.who IS NULL AND vs.ip = m.ip AND m.who IS NOT NULL AND m.who <> 'Alle';

UPDATE public.visitor_login_attempts a
SET who = m.who
FROM public.ip_user_mapping m
WHERE a.who IS NULL AND a.ip = m.ip AND m.who IS NOT NULL AND m.who <> 'Alle';
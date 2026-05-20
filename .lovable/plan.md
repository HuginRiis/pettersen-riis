# Sensor-dashboard på Vakttårnet

Plassering: rett over "Sendte varslinger" på `/vakttarnet`. Henter data fra Homey-sensorer (bevegelse, dør, vindu, lås) og viser KPI-er, grafer, filter og innstillinger.

## Datalag (ny tabell + cron)

Homey eksponerer kun nåværende tilstand i snapshot — vi må selv logge endringer over tid for å bygge statistikk.

- Ny tabell `homey_sensor_events` (id, ts, device_id, device_name, zone, kind, capability_id, event_type, value).
- Ny tabell `homey_sensor_state` (siste verdi per device+capability) for diff-deteksjon mellom kjøringer.
- Ny route-hook `POST /api/public/hooks/homey-sensor-poll`:
  - Henter `getHomeyRawSnapshot()`, plukker ut enheter med `alarm_motion`, `alarm_contact`, `locked`.
  - Diff mot `homey_sensor_state`. Skriv ny rad i `homey_sensor_events` ved transisjon (motion_on/off, opened/closed, locked/unlocked). Upsert state.
- pg_cron-jobb hvert minutt kaller hooken.
- Settings (dag/natt-tider) lagres i eksisterende `notification_settings`-tabell under key `homey_sensor_dashboard`.

## Server-funksjoner

`src/server/homey-sensor-dashboard.functions.ts`:

- `getHomeySensorDashboard({ range })` — range = `today | yesterday | week | last7`. Returnerer:
  - totals: motion-events, door open/close, lock/unlock, window opens
  - topRoom (zone med mest aktivitet)
  - lastMotion: { ts, device, zone }
  - hourly: 24 buckets med motion/door/lock/window
  - byRoom: liste over rom med antall events
  - daily: bucket per dag (for week/last7)
  - dayNight: { day, night } counts basert på innstillinger
  - inactiveSensors: enheter uten event på > 7 dager
  - anomalies: enkel z-score mot 7-dagers gjennomsnitt per time → markerer uvanlige topper
  - peakHours: topp 3 timer typisk aktivitet
- `getHomeySensorSettings()` / `saveHomeySensorSettings({ dayStart, dayEnd })` (lagrer i `notification_settings`).

## UI

`src/components/HomeySensorDashboard.tsx`:

- Filter-pills: I dag / I går / Denne uken / Siste 7 dager
- KPI-grid (6 bokser): Total bevegelse, Mest aktivt rom, Siste bevegelse, Dør-åpninger, Lås opp-hendelser, Vindu-åpninger
- KPI: Natt vs dag (mini bar)
- Graf 1: Aktivitet per time (stacked bar: motion/door/lock)
- Graf 2: Per rom (horisontal bar)
- Graf 3: Dør- og lås-aktivitet over tid (line)
- Graf 4: Trend for valgt periode (line)
- "Smart innsikt"-panel (kollapset by default): uvanlige mønstre, økning vs forrige periode, inaktive sensorer, vanlige aktivitetstopper
- Settings-popover: dag start/slutt + natt start/slutt (HH:MM)

## Integrering i `src/routes/vakttarnet.tsx`

- Ny seksjon `vt-sensors` plassert rett over `vt-push`.
- Ny TOC-oppføring "Sensor-dashboard" (Activity-ikon).

## Filer som endres / opprettes

- `supabase/migrations/<ts>_homey_sensor_events.sql` (tabeller + RLS + cron-jobb)
- `src/server/homey-sensor-poll.server.ts` (poll/diff-logikk)
- `src/server/homey-sensor-dashboard.functions.ts` (stats + settings server fns)
- `src/routes/api/public/hooks/homey-sensor-poll.ts` (cron-hook)
- `src/components/HomeySensorDashboard.tsx`
- `src/routes/vakttarnet.tsx` (TOC + ny seksjon)

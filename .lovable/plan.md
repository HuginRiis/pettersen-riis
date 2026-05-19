# Plan: Flyradar-side

## Datakilde
- **OpenSky Network** (gratis, åpen API, ingen nøkkel for anonym bruk).
- Endpoint: `https://opensky-network.org/api/states/all?lamin=...&lomin=...&lamax=...&lomax=...`
- Norge-bbox: lat 57.5–71.5, lon 4.0–31.5. Pollet hvert 30. sek på klient (anonym ratelimit ok).

## Sider og komponenter

### `/flyradar` (ny rute)
- **Hero** — eget GOT-bilde generert (himmel/festning + ravner + fly-silhuett, lik stilen som de andre hero-bildene).
- **Live statistikk**: totalt antall fly, antall i lufta, antall på bakken, snitt-høyde, snitt-fart, høyeste fly, raskeste fly.
- **Filter**:
  - Søk på flynummer/callsign
  - Land (default Norge — alle ICAO `nor*` callsigns + alle innenfor bbox)
  - Lufthavn (dropdown: OSL, BGO, TRD, SVG, TOS, BOO, KRS, AES, HAU, MOL, SKE, TRF, ALF) — viser fly innen 30 km
  - Radius fra punkt (lat/lon + km) — bruker også «min posisjon»-knapp
  - Min/maks høyde og fart (slider)
  - Bare «i lufta» / «på bakken» / «alle»
- **Liste**: callsign, land, høyde, fart, retning, posisjon, tid sist sett. Klikkbar — åpner detalj-modal med kart (mini-SVG over Norge med plassering).
- **Innstillinger-tab**:
  - Multi-select flyplasser å abonnere på + checkbox «varsel ved landing» / «varsel ved avgang»
  - Radius-sone: lat/lon + km + checkbox «varsel når fly krysser sonen»
  - Lagres i ny tabell `flight_alert_prefs` (single row).

### Innholdsfortegnelse / meny
- Legge til i `MENU_LINK_DEFS` (use-menu-visibility) som `{ to: "/flyradar", label: "Flyradar" }`.
- Legge til hall-card på `/` (med GOT-tema desc, hero-bilde).
- Legge til i `SEARCH_INDEX` med keywords (fly, flyradar, opensky, osl, lufthavn, gardermoen, …).
- Utvide HallCard `to`-union med `/flyradar`.

## Backend (server functions)
- `src/server/flyradar.functions.ts`:
  - `fetchFlightStates({ bbox, airport })` — proxy mot OpenSky for å unngå CORS og legge til litt caching (30 sek server-cache).
  - `getFlightAlertPrefs()` / `saveFlightAlertPrefs({...})` — single-row prefs.

## Database
- Ny tabell `flight_alert_prefs`:
  - `id uuid PK`, `airports text[]`, `notify_arrivals bool`, `notify_departures bool`,
  - `radius_center_lat numeric`, `radius_center_lon numeric`, `radius_km int`, `notify_radius bool`,
  - `min_altitude_m int default 0`, `updated_at timestamptz`.
  - Public read/write (samme mønster som andre prefs-tabeller her).

## Hva som ikke leveres nå
- Selve push-sendingen (cron som poller OpenSky og sender push når tilstand endres) er stort nok til egen runde. Innstillinger lagres, men varsler aktiveres når cron-jobben legges til etterpå.

## Filer som endres / opprettes
- **Ny**: `src/routes/flyradar.tsx`, `src/server/flyradar.functions.ts`, `src/assets/got-flyradar.jpg` (generert).
- **Endret**: `src/routes/index.tsx` (hall-card + union), `src/hooks/use-menu-visibility.ts` (MENU_LINK_DEFS), `src/lib/search-index.ts`.
- **Migrering**: ny `flight_alert_prefs`-tabell.

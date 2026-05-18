# Planter & Trær

Ny side `/planter` med AI-identifikasjon (spiselig/giftig/stell), bilde-arkiv med GPS, Mi Flora-sensor via Homey, og varslinger.

## Hva blir bygget

### 1. Database
Migrasjon med tre tabeller (alle med åpne RLS-policies som resten av prosjektet):

- **`plants`** — én rad per plante/tre:
  - `name`, `species_common`, `species_latin`, `kind` (plante/tre/busk/urt/blomst)
  - `edible` (boolean/null), `toxicity` (none/mild/moderate/severe/unknown), `toxicity_notes`
  - `care_summary`, `watering_days_interval`, `fertilize_weeks_interval`
  - `season_start_month`, `season_end_month` (for høsting)
  - `miflora_device_id`, `miflora_device_name` (Homey)
  - Sensor-terskler: `soil_moisture_min`, `light_lux_min`, `temp_min`, `temp_max`
  - Varsling-toggles: `notify_watering`, `notify_fertilize`, `notify_sensor`, `notify_season`
  - `last_watered_at`, `last_fertilized_at`
  - `cover_photo_id`, `ai_reference_image_url`

- **`plant_photos`** — flere bilder per plante:
  - `plant_id`, `photo_url`, `taken_at`, `lat`, `lon`, `location_label`, `is_ai_generated`, `notes`

- **`plant_notification_log`** — hindrer gjenta-spamming:
  - `plant_id`, `kind` (watering/fertilize/sensor/season), `notified_at`

Storage bucket `plants` (public).

### 2. Server-funksjoner (`src/server/plants.functions.ts`)
- `analyzePlantImage({ imageUrl })` — Lovable AI Gemini vision returnerer struktur: art, spiselig, giftighet, stell-tips, vanning, gjødsling.
- `generatePlantReference({ species })` — Lovable AI image (gemini-2.5-flash-image) lager illustrasjon, lagres i bucket.
- `searchPlantContext({ species, lat, lon })` — Gemini-tekst-svar: hvor vokser den i Norge, hva er spiselig på den, sesong.
- `getMiFloraDevices()` — filtrer Homey-snapshot på capabilities (`measure_humidity`+`measure_luminance`+`measure_conductivity`) eller navn-mønster (Flower Care, Mi Flora).
- `getMiFloraReading({ deviceId })` — leser fersk verdier fra Homey.
- CRUD: `listPlants`, `savePlant`, `deletePlant`, `addPlantPhoto`, `deletePlantPhoto`.

### 3. Side `/planter`
- Hero (AI-generert GoT-aktig hage-bilde).
- Knapp "Ta bilde / last opp" → kamera-input → laster opp til Storage → henter GPS via `navigator.geolocation` → kjører AI-analyse → forslag til nytt plante-kort som kan lagres.
- Grid med plante-kort: bilde, navn, spiselig-/giftig-merke, neste vanning, Mi Flora-verdier (fukt/lys/temp/næring) hvis koblet.
- Klikk på kort → detalj-dialog: alle bilder med GPS-prikker på mini-kart, AI-referansebilde, stell-tips, "hvor vokser den"-tekst, kobling til Mi Flora-enhet, vanning-/gjødsling-knapper ("vannet nå"), varsling-toggles.

### 4. Komponent: `PlantNotificationSettings`
- Liste over alle planter, per-plante toggles for vanning/gjødsling/sensor/sesong, intervaller, sensor-terskler.
- Brukes i `/push-varslinger` som ny seksjon `sec-planter`.

### 5. Cron-/sjekk-server-funksjon
- `checkPlantNotifications()` — kjøres fra eksisterende push-cron (snapshot-pulse-mønster) eller fra Steintavle-loop. Sender push når:
  - dager siden `last_watered_at` ≥ `watering_days_interval`
  - Mi Flora-måling under terskler
  - sesong starter
- Logger til `plant_notification_log` for å unngå spam.

### 6. Meny & navigasjon
- `RoutePath` får `/planter`, ikon `TreePine`, farge `#22c55e`.
- `navLinks` i `SiteHeader.tsx` — ny `{ to: "/planter", label: "Planter & Trær" }`.
- `MENU_LINK_DEFS` i `use-menu-visibility.ts` — samme.
- `/push-varslinger` TOC_ITEMS — ny `sec-planter`, "🌿 Planter & Trær".

## Tekniske notater

- Bildelagring: `supabase.storage.from("plants").upload(...)`, public URL.
- GPS: `navigator.geolocation.getCurrentPosition`, valgfritt — fallback "ukjent sted".
- Mi Flora-kobling: ingen ny OAuth — vi gjenbruker eksisterende Homey-tilkobling. Auto-deteksjon ved at vi viser alle Homey-enheter med `measure_humidity`/`measure_conductivity` i en dropdown når man redigerer en plante.
- AI: `google/gemini-2.5-flash` for vision-analyse (rimelig, rask), `google/gemini-2.5-flash-image` for referanse-illustrasjon.
- Push-cron-integrasjon: legger plant-sjekken inn i eksisterende `api.public.hooks.agenda-push.ts`-mønster.

## Avgrensninger
- Ingen offline-modus.
- Ingen kart-visning med alle plantenes GPS i denne runden (vises som koordinat-tekst og mini-link til Google Maps).
- AI-svar kan ta feil — UI viser tydelig "AI-forslag, sjekk selv før du spiser".

# Plan: Vakttårn-oppgraderinger + smart søk på hjemskjerm

## Oppgave 1 — Vakttårn

### 1a. Full oversikt over cron + datasynk
- Database/Cron-seksjonen viser allerede `cronJobs` og `dataSyncs`. Den listen er komplett (cron-jobs leses fra `cron.job` via RPC `get_db_usage_stats`, datasynk legges til manuelt for garmin).
- Utvider `dataSyncs` slik at den også inkluderer andre faktiske bakgrunnsjobber vi har: agenda-push (varsler), tibber daily snapshot, pulse snapshot, plante-vanning push, met-alerts, mail-delivery, weather-push, uv-push, met-alert-push, warranty-push, login-push, garbage-push — alle som trigges fra `agenda-push` hvert minutt. Vi lister dem som "datasynk" med sist kjøring fra api_call_log eller egne logger der vi har det, ellers fra `notification_settings` der det finnes.
- Resultat: én tabell "Cron (pg_cron)" og én tabell "Bakgrunnssynk (agenda-push)" med navn, intervall/regel, sist kjørt, neste, status.

### 1b. Lagringsbruk per kategori
Ny seksjon under Database som grupperer tabeller + storage-buckets i kategorier:

| Kategori | Inkluderer |
|---|---|
| App-data | økonomi, hytta, planter, agenda, birthdays, renovation, grocery, … |
| Logger | api_call_log, garmin_sync_log, home_alarm_log, push_send_log, garbage_notification_log, ai_search_log, visitor_*, login_attempts |
| API-data | tibber-snapshots, pulse-readings, garmin_*, netatmo_*, spot-pris, met, gardena_auth, homey_* |
| Bilder | storage-buckets: receipts, plants, payslips, garmin-devices, renovation (image-andelen) |
| Innstillinger | notification_settings, *_notification_prefs, api_pause_flags, favorites |
| Andre | resten |

Vi henter storage-størrelse via en ny SQL-funksjon `get_storage_usage_stats()` som summerer `storage.objects.metadata->>'size'` per bucket. Viser stolpe + MB/GB per kategori.

### 1c. Rydde-knapper i API-Call-Log
Nederst i `ApiCallLogPanel` legger jeg tre knapper:
- "Slett eldre enn 7 dager"
- "Slett eldre enn 14 dager"
- "Slett eldre enn 30 dager"

Bekreftelsesdialog før sletting. Bruker en ny serverFn `purgeApiCallLog({ olderThanDays })` som sletter både fra `api_call_log` (vellykkede + feilede).

### 1d. API-feil kollapset som standard
I `ApiErrorLogPanel`: endre `useState<Set<string>>(new Set())` → start med alle grupper kollapset (dvs `collapsedGroups = new Set(alle keys)`). Kollapset = default.

## Oppgave 2 — Smart søk på hjemskjermen

Nytt felt rett under hovedmenyen på `/`:
- Inputfelt med placeholder "Søk i hele borgen… (Gardena, planter, økonomi…)"
- To handlinger:
  - **Vanlig søk** (knapp / Enter): viser dropdown med statiske treff matchet mot et søkeindeks
  - **AI-søk** (knapp ✦): sender spørringen til Lovable AI Gateway (`google/gemini-2.5-flash`) med samme indeks som kontekst, og lar AI svare med relevante sider + kort forklaring
- Søkeindeks: en statisk liste i `src/lib/search-index.ts` med alle sider/funksjoner: `{ title, path, keywords[], description, section }`. Eksempel: Gardena → `/gressklipper`, Planter → `/planter`, Økonomi → `/okonomi`, Vakttårn → `/vakttarnet`, …
- Resultat-popup viser tittel + sti + kort beskrivelse. Klikk → navigerer dit.
- AI-svar logges i `ai_search_log` (eksisterende tabell) for budsjett-sporing.

## Tekniske detaljer

**Nye filer:**
- `src/lib/search-index.ts` — statisk liste over alle ruter med søkenøkkelord
- `src/components/SmartSearch.tsx` — søkefelt + popup, AI-knapp
- `src/server/smart-search.functions.ts` — serverFn `aiSmartSearch({query})` mot Lovable AI
- `src/server/api-call-log-purge.functions.ts` — serverFn `purgeApiCallLog`
- `src/server/storage-usage.functions.ts` — serverFn for storage bucket-størrelser

**Endrede filer:**
- `src/components/DbUsagePanel.tsx` — ny "Lagring per kategori"-seksjon
- `src/components/ApiCallLogPanel.tsx` — purge-knapper
- `src/components/ApiErrorLogPanel.tsx` — start kollapset
- `src/server/db-usage.functions.ts` — utvid datasynk-lista
- `src/routes/index.tsx` — sett inn `<SmartSearch />` under menyen

**Database-migrering:** Ny RPC `get_storage_usage_stats()` (security definer).

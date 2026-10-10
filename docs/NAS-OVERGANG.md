# Overgang fra Lovable til NAS – historikk og status

Skrevet 2026-10-10 av John (med Claude Code) som overlevering til Arne og Arnes Claude Code.
Les denne før du jobber videre med flyttingen. Daglig bruk står i `CLAUDE.md`.

## Mål

Appen «Riis-Pettersen Family» (House Pettersen-Riis) skal ut av Lovable og driftes selv, uten innlåsing:

- Egen Supabase (selvhostet), egen Node-server for appen, Claude i stedet for Lovable AI.
- Adresse: https://pettersen.riis.cc nå, og https://arne.riis.cc når DNS flyttes fra Lovable.
- Arne bruker sin egen Anthropic-nøkkel og eier sine egne integrasjoner og hemmeligheter.

## Hvor ting kjører

Alt kjører på Johns QNAP TS-453B (192.168.1.10). Den nås fra Arne via VPN.

| Del | Hva | Merknad |
|---|---|---|
| Supabase | Docker Compose i `/share/Container/supabase-pettersen` (prosjektnavn `pettersen`, containere `pettersen-*`) | Helt adskilt fra Johns Supabase (Stjerneflåten) |
| Studio | http://192.168.1.10:8001 (brukernavn `supabase`, passord fra John) | Bare på LAN/VPN, aldri på internett |
| App | Container `pettersen-web` (Node, port 3000), bygges fra `Dockerfile` | Hemmeligheter i `app.env` på NAS-en |
| Proxy | Caddy hos John: `pettersen.riis.cc, arne.riis.cc` → Supabase-stier til `pettersen-envoy:8000`, resten til `pettersen-web:3000` | Let's Encrypt automatisk |
| DNS | `pettersen.riis.cc` CNAME → `stathelle1.synology.me` (Johns IP) | `arne.riis.cc` peker fortsatt på Lovable |
| Backup | Johns `backup.sh` kl. 02:30: databasedump, storage-filer og env-filer, 14 dager lokalt + speiling til en annen NAS | Testet 2026-10-09 |

Arne har ingen skall-tilgang. All tilgang går gjennom «porten» `/share/Container/arne-gate/arne-gate.sh`
(se `CLAUDE.md` for kommandoene). Compose-filen for appen ligger fast i porten og kan ikke endres fra repoet.

## Hva som er gjort (2026-10-09)

1. **Supabase satt opp** på QNAP-en med egne, unike nøkler (JWT, anon, service role).
2. **Skjema migrert**: alle 166 migrasjoner i `supabase/migrations/` pluss hull som manglet i migrasjonene,
   men fantes i Lovable-databasen. De ligger i `migrering/schema-gaps.sql` (climate_notification_prefs,
   gardena_auth, push_quiet_hours og noen Garmin-kolonner).
3. **Data kopiert** fra Lovable via et midlertidig eksport-endepunkt (`/api/public/data-export` i Lovable-appen,
   beskyttet med EXPORT_TOKEN): 81 tabeller / 676 732 rader og 183 filer. Tallene er kontrollert mot kilden.
   Lagrede lenker til Lovable-lagring er skrevet om til `https://pettersen.riis.cc/storage/...`.
4. **Lovable AI byttet ut med Claude**: `src/lib/claude-gateway.server.ts` fanger opp kall til
   `https://ai.gateway.lovable.dev/v1/chat/completions` og sender dem til Claude via `@anthropic-ai/sdk`,
   og svaret oversettes tilbake til OpenAI-format. Resten av koden er uendret.
   - Standardmodell `claude-opus-5-5`, kan overstyres med `CLAUDE_MODEL`.
   - Bildegenerering (Garmin-bildene, `modalities: ["image"]`) støttes ikke av Claude og gir 501.
   - I `*.functions.ts` lastes avskjæreren med `createIsomorphicFn`, ellers havner serverkode i klientbygget.
5. **Bygg for Node**: `Dockerfile` med `NITRO_PRESET=node-server` og `NODE_OPTIONS=--max-old-space-size=4096`
   (bygget gikk tom for minne uten dette). Lovable sin Cloudflare-oppsett (`wrangler.jsonc`) brukes ikke.
6. **Lovable-spesifikke ting fjernet**: fem `.asset.json`-bilder i `src/assets` er byttet med ekte bildefiler,
   eksport-endepunktet og drizzle-hjelperne er fjernet, og Homey-callback peker til
   `https://pettersen.riis.cc/api/homey/callback`.
7. **Hemmeligheter**: nye VAPID-nøkler for push. `HOUSE_RIIS_PASSWORD` er satt. `LOVABLE_API_KEY` har en
   dummyverdi, fordi koden sjekker at den finnes.
8. **Cron-jobber** (pg_cron) er gjenskapt og kaller `http://pettersen-web:3000/api/public/hooks/...`.
   Bare to er aktive: `agenda-push-every-minute` og `snapshot-tibber-daily`. Resten venter på
   integrasjonsnøkler (se under).
9. **Tilgang for Arne**: porten `arne-gate.sh`, `deploy/deploy.sh`, `deploy/nas.sh` og `CLAUDE.md`.
   Publisering gjennom porten er testet: den tar ca. 9 minutter og appen svarer 200 etterpå.
10. **Ytelse på QNAP-en (2026-10-09)**: pooler (supavisor) er slått av i begge Supabase-oppsettene fordi
    ingen app bruker den, og helsesjekkene går hvert 60. sekund i stedet for hvert 5.
    (`docker-compose.health.yml`). Lasten falt fra ca. 9–14 til ca. 3.
    Å flytte appen til Arnes egen DS223 ble vurdert og forkastet, fordi 2 GB RAM er for lite.

## Hvorfor denne koden ligger på grenen `nas`

Lovable synkroniserer med `main`. Endringene for NAS-en ligger derfor på grenen `nas`, så Lovable-appen
fortsatt virker til overgangen er ferdig. Hadde de vært på `main`, ville Lovable mistet eksport-endepunktet
(som trengs til siste datasynk), og AI-en ville sluttet å virke, fordi den mangler Claude-nøkkelen.
Når Lovable er skrudd av, slås `nas` sammen med `main`.

## Gjenstår – i rekkefølge

1. **SSH-nøkkel for Arne**: Arne lager `~/.ssh/arne_nas` (ed25519) og sender `.pub`-linjen til John,
   som legger den inn låst til porten. Legg inn i `~/.ssh/config`:
   `Host 192.168.1.10` / `User admin` / `IdentityFile ~/.ssh/arne_nas`. Test: `deploy/nas.sh status`.
2. **`ANTHROPIC_API_KEY`**: Arnes egen nøkkel fra console.anthropic.com. Den er tom nå, så all AI gir feil.
3. **Integrasjonsnøkler** (sett med `set-secret`, se `CLAUDE.md`). Verdiene finnes i Lovable under
   Cloud → Secrets, eller hos hver tjeneste:
   - Tibber: `TIBBER_TOKEN`
   - Homey: `HOMEY_CLIENT_ID`, `HOMEY_CLIENT_SECRET`, `HOMEY_ID`. Lag gjerne en egen API-klient hos Athom med
     redirect `https://pettersen.riis.cc/api/homey/callback`, og koble til på nytt via `/api/homey/start`.
   - Netatmo: `NETATMO_CLIENT_ID`/`_SECRET`/`_REFRESH_TOKEN` og værstasjonen `NETATMO_WS_*`.
     En Netatmo-app har bare én redirect-URI, så legg inn den nye adressen.
   - Strava: `STRAVA_CLIENT_ID`/`_SECRET`, `STRAVA_CLIENT_ID_REBEKKA`/`_SECRET_REBEKKA`,
     `STRAVA_OAUTH_STATE_SECRET`. Callback-domenet hos Strava må endres. Rebekkas callback bruker arne.riis.cc.
   - Gardena: `GARDENA_APP_KEY`, `GARDENA_APP_SECRET`, `GARDENA_HOME_LAT`, `GARDENA_HOME_LON`
   - Roborock: `ROBOROCK_EMAIL`, `ROBOROCK_PASSWORD`
   - Eufy: `EUFY_WEBHOOK_TOKEN`. Open-Meteo: `OPEN_METEO_API_KEY`. Agenda-push: `AGENDA_PUSH_HOOK_TOKEN`
     (valgfri).
   Etter `set-secret`: `deploy/nas.sh restart`.
4. **Aktivere cron-jobbene** for integrasjonene som er satt opp. Eksempel:
   `echo "select cron.alter_job((select jobid from cron.job where jobname='radon-poll-hourly'), active := true);" | deploy/nas.sh sql`
5. **Garmin-bildegenerering**: bestem om den skal være av, eller bruke en annen tjeneste (f.eks. Gemini)
   med egen nøkkel. Dette gjelder `src/lib/garmin.functions.ts` og `src/lib/garmin-sync.server.ts`.
6. **Endelig datasynk**: Lovable-appen er fortsatt i bruk, så data som er endret etter 2026-10-09 må kopieres
   på nytt rett før overgangen. John har skriptene, og eksport-endepunktet i Lovable må finnes til da.
7. **DNS**: flytt `arne.riis.cc` fra Lovable til NAS-en (CNAME → `stathelle1.synology.me`).
   Caddy er allerede klar for det.
8. **Skru av Lovable**, slå `nas` sammen med `main` og gjør repoet privat.

## Ting å vite

- Bygget tar 8–10 minutter på NAS-en. Advarslene «Module level directives cause errors» er ufarlige.
- Rett etter publisering kan siden svare 502 i noen sekunder mens appen starter.
- `bun` virker ikke på NAS-en (CPU-en mangler AVX2), så bygget bruker `npm install`.
- Ikke legg hemmeligheter i repoet. `.env` i repoet inneholder bare offentlige `VITE_*`-verdier fra Lovable;
  verdiene for NAS-en settes som build-args på NAS-en.

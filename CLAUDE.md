# Riis-Pettersen Family (House Pettersen-Riis)

Familieapp for Arne og Rebekka. Opprinnelig laget i Lovable, nå selvhostet på Johns QNAP-NAS.

- App: https://pettersen.riis.cc (og https://arne.riis.cc når DNS er flyttet fra Lovable)
- Teknologi: TanStack Start (React + serverfunksjoner) bygget som Node-server, Supabase (selvhostet), Tailwind/shadcn
- Database: egen Supabase-installasjon på NAS-en, helt adskilt fra Johns apper

**Flyttingen fra Lovable er ikke ferdig.** Les `docs/NAS-OVERGANG.md` først: den forteller hva som er gjort,
hvorfor, og hva som gjenstår (i rekkefølge). Jobb på grenen `nas`. `main` synkes fortsatt til Lovable-appen
som er i bruk, så NAS-endringer der vil ødelegge den.

## Tilgang til NAS-en

NAS-en (192.168.1.10) nås bare via VPN hjem til John. Arnes SSH-nøkkel er låst til en port
(`/share/Container/arne-gate/arne-gate.sh`) som bare tillater kommandoene under, og bare mot denne appen
og denne databasen. Det finnes ikke skall-tilgang. Prøv aldri å omgå porten.

Alle kommandoer går via `deploy/nas.sh`:

| Hva | Kommando |
|---|---|
| Publiser appen (bygger på NAS-en, tar 8–10 min) | `deploy/deploy.sh` |
| Status for app og database | `deploy/nas.sh status` |
| Logg fra appen | `deploy/nas.sh logs 200` |
| Start appen på nytt | `deploy/nas.sh restart` |
| Navn på hemmeligheter (ikke verdier) | `deploy/nas.sh secrets` |
| Sett en hemmelighet | `printf '%s' "$VERDI" \| deploy/nas.sh set-secret NAVN` |
| Fjern en hemmelighet | `deploy/nas.sh unset-secret NAVN` |
| Kjør SQL mot databasen | `deploy/nas.sh sql < fil.sql` |
| Last ned databasekopi | `deploy/nas.sh db-dump > dump.sql.gz` |

## Regler

- **Hemmeligheter** (API-nøkler, passord) skal aldri skrives i koden, i chatten eller i filer i repoet.
  Be brukeren kjøre `set-secret` selv i terminalen, med en kommando som ikke viser verdien, for eksempel:
  `printf "Verdi: "; stty -echo; read V; stty echo; echo; printf '%s' "$V" | deploy/nas.sh set-secret NAVN; unset V`
- Serverkode leser hemmeligheter fra `process.env` (filen `app.env` på NAS-en). Nye hemmeligheter krever ingen kodeendring utover å lese dem.
- **Databaseendringer**: lag en ny fil i `supabase/migrations/` (tidsstempel først i navnet) og kjør den med
  `deploy/nas.sh sql < supabase/migrations/<fil>.sql`. Oppdater `src/integrations/supabase/types.ts` ved behov.
- **AI**: Koden kaller fortsatt Lovable sin AI-adresse, men `src/lib/claude-gateway.server.ts` fanger opp kallene
  og sender dem til Claude (nøkkel `ANTHROPIC_API_KEY`, modell `CLAUDE_MODEL`). I `*.functions.ts` lastes den via
  `createIsomorphicFn` (se eksisterende filer), ellers feiler klientbygget. Bildegenerering støttes ikke (gir 501).
- **Bygg**: `Dockerfile` bygger med `NITRO_PRESET=node-server` og `NODE_OPTIONS=--max-old-space-size=4096`.
  Compose-filen ligger fast på NAS-en (i porten) og kan ikke endres herfra.
- **Cron-jobber** (pg_cron i databasen) kaller appens hooks på `http://pettersen-web:3000/api/public/hooks/...`.
  Se dem med `echo "select jobname, schedule, active from cron.job;" | deploy/nas.sh sql`.
- Backup av database, filer og hemmeligheter tas hver natt kl. 02:30 og speiles til en annen NAS (John administrerer).

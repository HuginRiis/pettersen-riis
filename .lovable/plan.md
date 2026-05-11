## Hva vi bygger

To deler:

**1. En liten Node-tjeneste ("roborock-bridge") som du kjører hjemme**
- Logger inn på Roborock-skyen med e-post/passord (jeg lager en ferdig docker-pakke)
- Snakker MQTT med begge S7-ene og holder forbindelsen åpen
- Eksponerer enkle HTTP-endepunkter, f.eks. `POST /devices/:duid/start`, `/stop`, `/dock`, `/pause`, `/fan/:level`, `/mop/:level`, `/zone`, `/find`
- Beskyttes med en bearer-token du selv velger
- Kan kjøre på: Raspberry Pi, NAS (Synology/Unraid), gammel Mac/PC, eller en billig VPS (~30 kr/mnd). Trenger bare Docker.

**2. Utvidelse av RoborockPanel i appen**
- Knapper for hver robot: Start, Pause, Stopp, Send til dokk, Finn (pip), Tøm støvbeholder, Vask mopp
- Slider/knapper for sugehastighet (Stille / Balansert / Turbo / Maks)
- Slider/knapper for moppvann (Av / Lav / Middels / Høy)
- Velg rom å rense (henter rom-kart fra brokeren)
- Sone-rens: tegn rektangel på et lite kart, send koordinater
- Live-status (renser nå, batteri, feilkode, areal igjen)
- Bruker en ny secret `ROBOROCK_BRIDGE_URL` + `ROBOROCK_BRIDGE_TOKEN` så Worker kaller broren over HTTPS

## Hva jeg trenger fra deg

Før jeg bygger noe i appen må jeg vite:

- **Hvor vil du kjøre broren?** (Pi / NAS / VPS / annet — jeg skreddersyr docker-compose deretter)
- **Har du Docker tilgjengelig der?** Hvis ikke, jeg kan også lage en ren Node-versjon uten Docker.
- Når den kjører hjemme: trenger vi en måte å nå den fra Lovable Cloud — enten Cloudflare Tunnel (gratis, anbefalt) eller port-forwarding. Jeg foreslår Cloudflare Tunnel.

## Rekkefølge

1. Du svarer på de tre spørsmålene over.
2. Jeg lager `roborock-bridge`-pakken (egen mappe i repoet, eller eget repo om du vil) med README, docker-compose og alt klart til å kjøre.
3. Du starter den, tester at `curl https://din-bro/devices` lister begge S7-ene.
4. Du legger inn `ROBOROCK_BRIDGE_URL` + `ROBOROCK_BRIDGE_TOKEN` som secrets.
5. Jeg bygger ut RoborockPanel med alle kontrollene.

## Tekniske detaljer

- Bro bruker `python-roborock`-protokollen reimplementert i Node (`@bnxbnx/roborock-mqtt-client` eller egen liten klient mot `mqtts://eu-mqtt.roborock.com:8883`)
- Kommandoer sendes som AES-128-ECB-kryptert JSON med enhetens lokale nøkkel (hentes automatisk fra `home/v3` ved oppstart)
- Worker→Bro: vanlig `fetch` med `Authorization: Bearer …` — ingen MQTT i Worker
- Eksisterende login-flyt i appen beholdes som "lese-kanal" for snapshot, broren får egne credentials

Si fra hvilken host + om Docker er ok, så ruller jeg.

## Mål

1. Per-bruker favoritter i toppmenyen (basert på påloggings-/push-bruker, ikke localStorage).
2. Flytt "antall lys på" fra Smartborg-knappen til Lys-knappen, og tell ALLE lys (inkl. stikkontakter/dimmere som vises på /lys).
3. Konfigurerbare "Tenn alle / Slokk alle"-scener på Lys-siden: 3 bokser ved siden av hverandre, eget navn, valgbare lys, per push-bruker.
4. Samle alle innstillinger (favoritter + scener) på `/push-varslinger` under en ny seksjon kalt **"Innstillinger fremover"**.

## Database (ny migrasjon)

Ny tabell `user_menu_prefs` (per push-bruker, identifiseres med `who`-tekst):

- `who text not null unique` (f.eks. "Arne", "Rebekka", "Alle")
- `favorites text[] default '{}'` — route-paths
- `sort_by_usage boolean default false`
- `favorites_enabled boolean default true`

Ny tabell `user_light_scenes` (3 scener per bruker):

- `who text not null`
- `slot int not null` (0, 1, 2)
- `name text not null` (f.eks. "Tenn alle")
- `device_ids text[] default '{}'` (Homey device-IDer som inngår)
- `default_on boolean default true` (scene-knappen — kan vise både tenn/slokk-knapp uansett)
- `unique (who, slot)`

Begge med åpne RLS-policies (samme mønster som resten av prosjektet).

## Frontend-endringer

### `src/lib/push-client.ts` (ingen endring)
`getStoredWho()` brukes fortsatt som "current user".

### `src/hooks/use-menu-prefs.ts`
Skriv om: laster og lagrer fra `user_menu_prefs` via Supabase basert på `getStoredWho()`. Beholder samme API (`prefs`, `toggleFavorite`, `setSortByUsage`, `setFavoritesEnabled`) så `SiteHeader` ikke endres.

### `src/components/HallBadges.tsx` — `LightsOnBadge`
Endre filteret: tell alle enheter som er `class === "light"`, har `dim`-capability, eller matcher de samme "extra light"-tokenene som `/lys` (`["garsej","lys"]`, `["stålampe"]`). Tekst blir "💡 X/Y" der X = tente, Y = totalt.

### `src/components/SiteHeader.tsx`
Flytt `<LightsOnBadge inline />` fra `/smarthus`-linken til `/lys`-linken.

### `src/routes/smarthus.tsx`
Fjern den lille "X lys tent → /lys"-knappen øverst (linje 735–740). Resten av siden (Hue-panelet) er uendret.

### `src/routes/lys.tsx`
- Erstatt de to globale "Tenn alle / Slokk alle"-knappene med 3 scene-bokser (grid `sm:grid-cols-3`).
- Hver boks: scene-navn + "Tenn"/"Slokk"-knapper som kun trigger lysene i `device_ids`. Hvis `device_ids` er tomt → fall tilbake til "alle lys" (default for nye brukere).
- Last scener fra `user_light_scenes` for `getStoredWho()` ved mount; default-rader settes opp via UI-en hvis ingen finnes.
- Ingen redigering på selve Lys-siden — kun knapp "Endre scener" som lenker til `/push-varslinger#scener`.

### `src/routes/push-varslinger.tsx`
Ny seksjon helt øverst (over `UpcomingPushPanel`):

```
<section>
  <h2>Innstillinger fremover</h2>
  <MenuPreferencesPanel />        // Favoritter (eksisterende komponent, nå per-bruker via ny hook)
  <FavoritesManagerPanel />       // Web-favoritter (uendret)
  <LightScenesPanel />            // NY — 3 scener: navn + checklist over lys
</section>
```

### Ny `src/components/LightScenesPanel.tsx`

- Henter `getStoredWho()` og laster (eller seeder) 3 rader i `user_light_scenes`.
- Henter `getHomeySnapshot()` for å vise alle lys (samme filter som `/lys`).
- Per scene: input for navn + checklist (med søk) over lys, gruppert per sone.
- Lagrer på endring (debounced upsert).

## Tekniske detaljer

- "Bruker" identifiseres via `getStoredWho()` fra `src/lib/push-client.ts`. Hvis "Alle" → bruker en delt rad "Alle".
- `useMenuPrefs` blir async; mens den laster, returner default-objekt (eksisterende kode tåler det).
- Migrasjon for `weather_notification_prefs`-tabellen er ikke nødvendig (eksisterer allerede iflg. push-varslinger.tsx).

## Endringsomfang

Filer endret: 5 (use-menu-prefs.ts, HallBadges.tsx, SiteHeader.tsx, smarthus.tsx, lys.tsx, push-varslinger.tsx).
Filer opprettet: 1 (LightScenesPanel.tsx).
Migrasjoner: 1 (to nye tabeller + RLS).
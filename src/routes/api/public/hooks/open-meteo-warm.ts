// Cron-endepunkt som varmer Open-Meteo-cachen for alle lokasjoner som har
// aktive air-quality- eller UV-push. Kalles hvert 30. minutt fra pg_cron.
// Brukere som åpner luftkvalitet-/UV-/pollen-panelene ser kun cachet data;
// dette endepunktet er den eneste plassen vi faktisk treffer Open-Meteo
// for panel-dataene.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  warmAirQualityPanel,
  warmUvCloudPanel,
} from "@/lib/air-quality-fetch.server";

type LocRow = { lat: number; lon: number; enabled: boolean };

const BETWEEN_LOCATIONS_DELAY_MS = 1500;

// Faste lokasjoner som alltid varmes, uavhengig av push-prefs.
// Disse vises som hardkodede paneler på /pollen.
const ALWAYS_WARM: Array<{ lat: number; lon: number }> = [
  { lat: 59.91, lon: 9.07 }, // Hytta · Lyngdal i Numedal
];

function dedupeLocs(rows: LocRow[]): Array<{ lat: number; lon: number }> {
  const seen = new Map<string, { lat: number; lon: number }>();
  for (const r of rows) {
    if (!r.enabled) continue;
    if (typeof r.lat !== "number" || typeof r.lon !== "number") continue;
    const key = `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, { lat: r.lat, lon: r.lon });
  }
  return [...seen.values()];
}

export const Route = createFileRoute("/api/public/hooks/open-meteo-warm")({
  server: {
    handlers: {
      POST: async () => {
        const started = Date.now();
        const [{ data: aq }, { data: uv }, { data: userLocs }] = await Promise.all([
          supabaseAdmin
            .from("air_quality_notification_prefs" as never)
            .select("lat,lon,enabled") as any,
          supabaseAdmin
            .from("uv_notification_prefs" as never)
            .select("lat,lon,enabled") as any,
          supabaseAdmin
            .from("user_location_prefs" as never)
            .select("lat,lon,page")
            .in("page", ["pollen"]) as any,
        ]);
        const aqLocs = dedupeLocs((aq ?? []) as LocRow[]);
        const uvLocs = dedupeLocs((uv ?? []) as LocRow[]);
        const userPollenLocs: Array<{ lat: number; lon: number }> = ((userLocs ?? []) as any[])
          .filter((r) => typeof r.lat === "number" && typeof r.lon === "number")
          .map((r) => ({ lat: r.lat, lon: r.lon }));

        // Én felles Open-Meteo core-varming dekker AQ + pollen for unionen av
        // air-quality-, UV- og aktive pollen-side-lokasjoner. UV-cloud bruker
        // samme core-cache; skydekke hentes fra MET for å unngå flere
        // Open-Meteo-hosts. Vi kjører UV-cloud for HELE unionen slik at både
        // Borgen/Tollnes (fra user_location_prefs) og hytta får UV-data.
        const unionSeen = new Map<string, { lat: number; lon: number }>();
        for (const l of [...aqLocs, ...uvLocs, ...userPollenLocs, ...ALWAYS_WARM]) {
          const k = `${l.lat.toFixed(3)},${l.lon.toFixed(3)}`;
          if (!unionSeen.has(k)) unionSeen.set(k, l);
        }
        const unionLocs = [...unionSeen.values()];

        const results: Array<{ kind: string; lat: number; lon: number; ok: boolean; err?: string }> = [];

        const pause = () => new Promise((resolve) => setTimeout(resolve, BETWEEN_LOCATIONS_DELAY_MS));

        async function run(kind: string, lat: number, lon: number, fn: () => Promise<void>) {
          try {
            await fn();
            results.push({ kind, lat, lon, ok: true });
          } catch (err: any) {
            results.push({ kind, lat, lon, ok: false, err: String(err?.message ?? err) });
          }
        }

        for (let i = 0; i < unionLocs.length; i++) {
          const { lat, lon } = unionLocs[i];
          await run("core", lat, lon, () => warmAirQualityPanel(lat, lon));
          if (i < unionLocs.length - 1) await pause();
        }
        for (let i = 0; i < unionLocs.length; i++) {
          const { lat, lon } = unionLocs[i];
          await run("uvcloud", lat, lon, () => warmUvCloudPanel(lat, lon));
          if (i < unionLocs.length - 1) await pause();
        }


        return Response.json({
          ok: true,
          duration_ms: Date.now() - started,
          aq_locations: aqLocs.length,
          uv_locations: uvLocs.length,
          results,
        });
      },
    },
  },
});

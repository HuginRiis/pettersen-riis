// Daily backfill hook for air_quality_history. Pulls yesterday's hourly
// data for the configured locations. Called from pg_cron at 04:15 UTC.

import { createFileRoute } from "@tanstack/react-router";
import { ensureHistory } from "@/lib/air-quality-history.server";

const LOCATIONS: Array<{ key: string; lat: number; lon: number }> = [
  { key: "tollnes", lat: 59.1789, lon: 9.5732 },
];

export const Route = createFileRoute("/api/public/hooks/air-quality-history-daily")({
  server: {
    handlers: {
      POST: async () => {
        const started = Date.now();
        const results: any[] = [];
        for (const loc of LOCATIONS) {
          try {
            const r = await ensureHistory(loc.key, loc.lat, loc.lon, 1);
            results.push({ ok: true, key: loc.key, ...r });
          } catch (err: any) {
            results.push({ ok: false, key: loc.key, error: String(err?.message ?? err) });
          }
        }
        return Response.json({ ok: true, duration_ms: Date.now() - started, results });
      },
    },
  },
});

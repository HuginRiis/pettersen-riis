import { createFileRoute } from "@tanstack/react-router";
import { runStravaDashboard } from "@/server/strava";
import { STRAVA_OWNERS } from "@/lib/strava-shared";

/**
 * Bakgrunns-polling for Strava-dashboards.
 * Kalles av pg_cron hver halvtime mellom 06:00–22:00 Oslo (UTC 5–19).
 * Tvinger fersk henting (force) slik at TTL hoppes over.
 */
export const Route = createFileRoute("/api/public/hooks/strava-poll")({
  server: {
    handlers: {
      POST: async () => {
        const results: Array<{ owner: string; ok: boolean; error?: string }> = [];
        for (const owner of STRAVA_OWNERS) {
          try {
            const conn = await getStravaConnection(owner);
            if (!conn) {
              results.push({ owner, ok: false, error: "not connected" });
              continue;
            }
            await runStravaDashboard(owner, { force: true });
            results.push({ owner, ok: true });
          } catch (e: any) {
            results.push({ owner, ok: false, error: e?.message ?? "unknown" });
          }
        }
        return new Response(JSON.stringify({ ok: true, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});

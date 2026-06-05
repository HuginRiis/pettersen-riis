import { createFileRoute } from "@tanstack/react-router";
import { fetchGardenaSnapshot } from "@/lib/gardena.server";
import { saveGardenaSnapshot } from "@/lib/gardena-snapshot-store.server";

/**
 * Bakgrunns-polling for Gardena/Husqvarna.
 * Kalles av pg_cron hver halvtime mellom 06:00–22:00 Oslo (UTC 5–19).
 * Snapshot lagres i `public.gardena_snapshot` slik at både
 * /gressklipper og smart-dashbord kan lese siste status uten å treffe
 * Husqvarna-API-et på nytt.
 */
export const Route = createFileRoute("/api/public/hooks/gardena-poll")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const snap = await fetchGardenaSnapshot();
          await saveGardenaSnapshot(snap);
          return new Response(
            JSON.stringify({
              ok: true,
              locations: snap?.locations?.length ?? 0,
              mowers: snap?.mowers?.length ?? 0,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? "unknown" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
      GET: async () => new Response("ok"),
    },
  },
});

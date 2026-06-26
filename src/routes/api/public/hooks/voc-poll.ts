import { createFileRoute } from "@tanstack/react-router";
import { getVocStatus } from "@/lib/voc.functions";

// Timesvis polling av VOC via Homey. Trigges av pg_cron.
export const Route = createFileRoute("/api/public/hooks/voc-poll")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const r = await getVocStatus();
          return new Response(
            JSON.stringify({
              ok: r.ok,
              devices: r.devices.length,
              fetchedAt: r.fetchedAt,
              error: r.error,
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

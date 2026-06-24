import { createFileRoute } from "@tanstack/react-router";
import { getRadonStatus } from "@/lib/radon.functions";

// Timesvis polling av Airthings/radon via Homey. Trigges av pg_cron.
export const Route = createFileRoute("/api/public/hooks/radon-poll")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const r = await getRadonStatus();
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

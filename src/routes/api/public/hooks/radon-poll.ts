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
              fetchedAt: r.fetchedAt,
              error: r.error,
              devices: r.devices.map((d) => ({
                name: d.name,
                zone: d.zone,
                current: d.current,
                lastUpdated: d.lastUpdated,
                hourly48: d.hourly48.length,
                hourly48NonNaN: d.hourly48.filter((p) => Number.isFinite(p.v)).length,
                hourly48Sample: d.hourly48.slice(0, 3),
                daily14: d.daily14.length,
                daily14NonNaN: d.daily14.filter((p) => Number.isFinite(p.v)).length,
              })),
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

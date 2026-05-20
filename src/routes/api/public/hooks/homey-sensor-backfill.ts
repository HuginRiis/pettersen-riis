import { createFileRoute } from "@tanstack/react-router";
import { backfillHomeySensorHistory } from "@/server/homey-sensor-backfill.server";

export const Route = createFileRoute("/api/public/hooks/homey-sensor-backfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const resolution = (url.searchParams.get("resolution") ?? "last31Days") as any;
          const r = await backfillHomeySensorHistory(resolution);
          return new Response(JSON.stringify(r), {
            headers: { "Content-Type": "application/json" },
          });
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

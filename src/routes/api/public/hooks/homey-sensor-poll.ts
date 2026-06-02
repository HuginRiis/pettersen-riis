import { createFileRoute } from "@tanstack/react-router";
import { pollHomeySensors } from "@/server/homey-sensor-poll.server";

export const Route = createFileRoute("/api/public/hooks/homey-sensor-poll")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const r = await pollHomeySensors();
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

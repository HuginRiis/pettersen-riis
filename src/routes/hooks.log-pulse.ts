import { createFileRoute } from "@tanstack/react-router";
import { logPulseReadings } from "@/server/pulse-readings";

export const Route = createFileRoute("/hooks/log-pulse")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await logPulseReadings();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[hooks/log-pulse] failed", err);
          return new Response(
            JSON.stringify({ ok: false, error: String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

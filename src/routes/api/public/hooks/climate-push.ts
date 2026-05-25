import { createFileRoute } from "@tanstack/react-router";
import { processClimateNotifications } from "@/server/climate-push.server";

/**
 * Kjøres av pg_cron hvert 10. minutt. Leser ferske Netatmo-temperaturer
 * for de tre rommene og sender push hvis terskler er passert.
 */
export const Route = createFileRoute("/api/public/hooks/climate-push")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await processClimateNotifications();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? "unknown" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
      GET: async () => {
        try {
          const result = await processClimateNotifications();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? "unknown" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

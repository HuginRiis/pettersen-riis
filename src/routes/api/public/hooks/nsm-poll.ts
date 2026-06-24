// Henter NSM-varsler og sender push for nye. Kjøres 5x per dag via pg_cron.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/nsm-poll")({
  server: {
    handlers: {
      POST: async () => {
        const started = Date.now();
        try {
          const { pollAndStoreNsm, processNsmNotifications } = await import(
            "@/lib/nsm-alerts.server"
          );
          const stored = await pollAndStoreNsm();
          const pushed = await processNsmNotifications();
          return Response.json({
            ok: true,
            duration_ms: Date.now() - started,
            stored,
            pushed,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
      GET: async () => {
        // Tillat manuell trigger via GET for enkel debugging
        try {
          const { pollAndStoreNsm, processNsmNotifications } = await import(
            "@/lib/nsm-alerts.server"
          );
          const stored = await pollAndStoreNsm();
          const pushed = await processNsmNotifications();
          return Response.json({ ok: true, stored, pushed });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});

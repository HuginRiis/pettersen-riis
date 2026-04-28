import { createFileRoute } from "@tanstack/react-router";
import { snapshotPulseToDb } from "@/server/tibber-pulse-snapshot.server";

export const Route = createFileRoute("/api/public/hooks/snapshot-pulse")({
  server: {
    handlers: {
      POST: async () => {
        const result = await snapshotPulseToDb();
        const status = result.error ? 500 : 200;
        return new Response(JSON.stringify({ ok: !result.error, ...result }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => {
        const result = await snapshotPulseToDb();
        const status = result.error ? 500 : 200;
        return new Response(JSON.stringify({ ok: !result.error, ...result }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

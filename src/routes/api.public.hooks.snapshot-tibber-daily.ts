import { createFileRoute } from "@tanstack/react-router";
import { snapshotTibberDailyToDb } from "@/lib/tibber-daily-snapshot.server";

export const Route = createFileRoute("/api/public/hooks/snapshot-tibber-daily")({
  server: {
    handlers: {
      POST: async () => {
        const result = await snapshotTibberDailyToDb();
        const status = result.error ? 500 : 200;
        return new Response(JSON.stringify({ ok: !result.error, ...result }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => {
        const result = await snapshotTibberDailyToDb();
        const status = result.error ? 500 : 200;
        return new Response(JSON.stringify({ ok: !result.error, ...result }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { syncIntraday } from "@/server/garmin-sync.server";

export const Route = createFileRoute("/api/public/hooks/garmin-rebekka-intraday")({
  server: {
    handlers: {
      GET: async () => {
        const n = await syncIntraday("rebekka", 7);
        return Response.json({ ok: true, rows: n });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { fetchRoborockSnapshot } from "@/server/roborock.server";

export const Route = createFileRoute("/api/public/hooks/roborock-snapshot-debug")({
  server: {
    handlers: {
      GET: async () => {
        const snap = await fetchRoborockSnapshot();
        return Response.json(snap);
      },
    },
  },
});

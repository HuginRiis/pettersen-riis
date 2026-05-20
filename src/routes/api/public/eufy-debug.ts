import { createFileRoute } from "@tanstack/react-router";
import { debugEufyImages } from "@/server/eufy-debug.functions";

export const Route = createFileRoute("/api/public/eufy-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const match = url.searchParams.get("match") ?? "bilene";
        const res = await debugEufyImages({ data: { match } });
        return new Response(JSON.stringify(res, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

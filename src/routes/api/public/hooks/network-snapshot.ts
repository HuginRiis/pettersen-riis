import { createFileRoute } from "@tanstack/react-router";
import { getNetworkSnapshot } from "@/server/network.functions";

export const Route = createFileRoute("/api/public/hooks/network-snapshot")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const r = await getNetworkSnapshot();
          return new Response(
            JSON.stringify({
              ok: r.ok,
              error: r.error ?? null,
              routers: r.routers.length,
              clients: r.clients.length,
              all: r.allDevices.length,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
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

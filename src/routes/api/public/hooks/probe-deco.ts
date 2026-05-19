import { createFileRoute } from "@tanstack/react-router";
import { getValidConnection, getHomeySessionContext } from "@/server/homey";

export const Route = createFileRoute("/api/public/hooks/probe-deco")({
  server: {
    handlers: {
      GET: async () => {
        const conn = await getValidConnection();
        if (!conn) return Response.json({ error: "no conn" });
        const session = await getHomeySessionContext(conn);
        if (!session) return Response.json({ error: "no session" });
        const base = session.target.baseUrl;
        const tok = session.sessionToken;
        const fj = async (u: string) => {
          try {
            const r = await fetch(u, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
            const ct = r.headers.get("content-type") || "";
            const body = ct.includes("json") ? await r.json() : (await r.text()).slice(0, 800);
            return { status: r.status, body };
          } catch (e: any) { return { error: e?.message }; }
        };
        const apps = await fj(`${base}/api/manager/apps/app`);
        const appsBody = (apps as any).body;
        const appKeys = appsBody && typeof appsBody === "object" && !Array.isArray(appsBody) ? Object.keys(appsBody) : null;
        const decoAppIds = appKeys ? appKeys.filter((k) => /deco|tp.?link/i.test(k)) : [];

        const devices = await fj(`${base}/api/manager/devices/device`);
        const dlist = Array.isArray((devices as any).body)
          ? (devices as any).body
          : Object.values((devices as any).body ?? {});
        const router = (dlist as any[]).find((d) => /living\s*room/i.test(d?.name ?? "") && /xe75|deco/i.test(d?.name ?? ""))
          ?? (dlist as any[]).find((d) => /deco|xe75/i.test(d?.name ?? ""));
        const routerSample = router ? {
          id: router.id,
          name: router.name,
          driverUri: router.driverUri,
          driverId: router.driverId,
          capKeys: Object.keys(router.capabilitiesObj ?? router.capabilities_obj ?? {}),
          topKeys: Object.keys(router),
        } : null;

        const appProbes: Record<string, any> = {};
        for (const id of decoAppIds) {
          appProbes[id] = {
            settings: await fj(`${base}/api/app/${id}/`),
            clients: await fj(`${base}/api/app/${id}/clients`),
            getClients: await fj(`${base}/api/app/${id}/getClients`),
            devices: await fj(`${base}/api/app/${id}/devices`),
            ...(router ? {
              routerClients: await fj(`${base}/api/app/${id}/clients/${router.id}`),
              routerGetClients: await fj(`${base}/api/app/${id}/getClients/${router.id}`),
            } : {}),
          };
        }

        return new Response(JSON.stringify({ decoAppIds, routerSample, appProbes }, null, 2), { headers: { "content-type": "application/json" } });
      },
    },
  },
});

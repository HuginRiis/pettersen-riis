import { createServerFn } from "@tanstack/react-start";
import { getValidConnection, getHomeySessionContext } from "./homey";

export const debugEufyImages = createServerFn({ method: "GET" })
  .inputValidator((input: { match?: string }) => input ?? {})
  .handler(async ({ data }) => {
    const hint = (data?.match ?? "bilene").toString().toLowerCase();
    const conn = await getValidConnection();
    if (!conn) return { ok: false, error: "no conn" };
    const session = await getHomeySessionContext(conn);
    if (!session) return { ok: false, error: "no session" };
    const base = `${session.target.baseUrl}/api`;

    const res = await fetch(`${base}/manager/devices/device`, {
      headers: { Authorization: `Bearer ${session.sessionToken}` },
    });
    const raw = await res.json();
    const list: any[] = Array.isArray(raw) ? raw : Object.values(raw ?? {});
    const matches = list.filter((d) => {
      const blob = `${d?.name ?? ""} ${d?.driverUri ?? ""}`.toLowerCase();
      return blob.includes(hint) || blob.includes("eufy");
    });

    const out = matches.slice(0, 10).map((d) => ({
      id: d?.id,
      name: d?.name,
      driverUri: d?.driverUri,
      class: d?.class,
      virtualClass: d?.virtualClass,
      capabilities: Array.isArray(d?.capabilities) ? d.capabilities : Object.keys(d?.capabilities ?? {}),
      images: d?.images,
      imageKeys: d?.images ? Object.keys(d.images?.[0] ?? {}) : null,
    }));

    return { ok: true, baseUrl: session.target.baseUrl, count: out.length, devices: out };
  });

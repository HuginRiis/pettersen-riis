import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidConnection, getHomeyRawSnapshot } from "./homey";

export type NetworkDevice = {
  id: string;
  name: string;
  kind: "router" | "client" | "other";
  zone: string | null;
  available: boolean;
  signal: number | null;
  watt: number | null;
  capabilities: Record<string, string | number | boolean | null>;
};

export type NetworkSnapshotResult = {
  ok: boolean;
  error?: string;
  generatedAt: string;
  routers: NetworkDevice[];
  clients: NetworkDevice[];
  others: NetworkDevice[];
  topMostSeen: { device_id: string; device_name: string | null; samples: number; last_seen: string }[];
  recentEvents: { device_id: string; device_name: string | null; event: "connect" | "disconnect"; ts: string }[];
  totalsLast24h: { connectedClients: number; totalSamples: number };
};

function classify(d: any): "router" | "client" | "other" {
  const name = String(d.name ?? "").toLowerCase();
  const driver = String(d.driverUri ?? d.driverId ?? d.driver?.uri ?? d.driver?.id ?? "").toLowerCase();
  const cls = String(d.class ?? "").toLowerCase();
  if (
    driver.includes("deco") ||
    driver.includes("tp-link") ||
    driver.includes("tplink") ||
    name.includes("deco") ||
    name.includes("xe75") ||
    name.includes("tp-link") ||
    cls.includes("internetgateway")
  ) {
    return "router";
  }
  if (
    driver.includes("wifi") ||
    driver.includes("network") ||
    cls === "other" && (name.includes("phone") || name.includes("ipad") || name.includes("laptop"))
  ) {
    return "client";
  }
  return "other";
}

function readNum(caps: any, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = caps?.[k]?.value;
    if (typeof v === "number") return v;
  }
  return null;
}

function mapDevice(d: any): NetworkDevice {
  const caps = d.capabilitiesObj ?? d.capabilities_obj ?? {};
  const kind = classify(d);
  const signal =
    readNum(caps, "measure_rssi", "signal_strength", "measure_signal_strength") ??
    readNum(caps, "rssi");
  const watt = readNum(caps, "measure_power");
  const capSummary: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(caps)) {
    const val = (v as any)?.value;
    capSummary[k] = typeof val === "string" || typeof val === "number" || typeof val === "boolean" ? val : null;
  }
  return {
    id: d.id ?? d._id ?? "",
    name: d.name ?? "Ukjent",
    kind,
    zone: d.zone ?? null,
    available: d.available !== false,
    signal,
    watt,
    capabilities: capSummary,
  };
}

async function logSnapshot(devices: NetworkDevice[]) {
  if (devices.length === 0) return;
  const rows = devices.map((d) => ({
    device_id: d.id,
    device_name: d.name,
    kind: d.kind,
    available: d.available,
    signal: d.signal,
    watt: d.watt,
    zone: d.zone,
    raw: d.capabilities as never,
  }));
  await supabaseAdmin.from("network_snapshots").insert(rows);
}

export const getNetworkSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<NetworkSnapshotResult> => {
    const generatedAt = new Date().toISOString();
    let routers: NetworkDevice[] = [];
    let clients: NetworkDevice[] = [];
    let others: NetworkDevice[] = [];
    let error: string | undefined;

    try {
      const conn = await getValidConnection();
      if (!conn) {
        error = "Homey er ikke koblet til.";
      } else {
        const raw = await getHomeyRawSnapshot(conn);
        if (raw) {
          for (const d of raw.devicesRaw) {
            const m = mapDevice(d);
            if (m.kind === "router") routers.push(m);
            else if (m.kind === "client") clients.push(m);
          }
          // "Other" — vis kun rutere/klienter i UI; ikke logg alt annet
          // Logg snapshot for historikk
          try {
            await logSnapshot([...routers, ...clients]);
          } catch (e) {
            console.error("[network] log snapshot failed", e);
          }
        } else {
          error = "Klarte ikke hente Homey-snapshot.";
        }
      }
    } catch (e: any) {
      error = e?.message ?? "Ukjent feil";
    }

    // Aggregeringer fra log
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { data: aggRows } = await supabaseAdmin
      .from("network_snapshots")
      .select("device_id, device_name, ts, available")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(5000);

    const byDevice = new Map<string, { name: string | null; samples: number; last: string }>();
    let totalSamples = 0;
    const connectedNow = new Set<string>();
    for (const r of aggRows ?? []) {
      totalSamples++;
      const cur = byDevice.get(r.device_id) ?? { name: r.device_name, samples: 0, last: r.ts };
      cur.samples++;
      if (r.ts > cur.last) cur.last = r.ts;
      byDevice.set(r.device_id, cur);
      if (r.available && r.ts === cur.last) connectedNow.add(r.device_id);
    }
    const topMostSeen = [...byDevice.entries()]
      .map(([device_id, v]) => ({ device_id, device_name: v.name, samples: v.samples, last_seen: v.last }))
      .sort((a, b) => b.samples - a.samples)
      .slice(0, 10);

    // Recent connect/disconnect events: scan availability transitions
    const recentEvents: NetworkSnapshotResult["recentEvents"] = [];
    const byDevSorted = new Map<string, { ts: string; available: boolean; name: string | null }[]>();
    for (const r of aggRows ?? []) {
      const arr = byDevSorted.get(r.device_id) ?? [];
      arr.push({ ts: r.ts, available: !!r.available, name: r.device_name });
      byDevSorted.set(r.device_id, arr);
    }
    for (const [device_id, arr] of byDevSorted) {
      arr.sort((a, b) => a.ts.localeCompare(b.ts));
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].available !== arr[i - 1].available) {
          recentEvents.push({
            device_id,
            device_name: arr[i].name,
            event: arr[i].available ? "connect" : "disconnect",
            ts: arr[i].ts,
          });
        }
      }
    }
    recentEvents.sort((a, b) => b.ts.localeCompare(a.ts));

    return {
      ok: !error,
      error,
      generatedAt,
      routers,
      clients,
      others,
      topMostSeen,
      recentEvents: recentEvents.slice(0, 30),
      totalsLast24h: { connectedClients: connectedNow.size, totalSamples },
    };
  },
);

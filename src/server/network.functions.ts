import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidConnection, getHomeyRawSnapshot } from "./homey";

export type CapValue = string | number | boolean | null;

export type NetworkDevice = {
  id: string;
  name: string;
  kind: "router" | "client" | "iot" | "other";
  zone: string | null;
  available: boolean;
  // signal as numeric (dBm if present) — fallback null
  signal: number | null;
  // text quality ("Good", "Fair", …) hvis Homey eksponerer det
  signalQuality: string | null;
  watt: number | null;
  // ruter-spesifikt
  downloadKbs: number | null;
  uploadKbs: number | null;
  cpu: number | null;
  memory: number | null;
  clients: number | null;
  ipAddress: string | null;
  master: boolean | null;
  wired: boolean | null;
  // utvidet info fra Homey-capabilities
  wanConnected: boolean | null;       // alarm_wan_connected_ipv4 (true = tilkoblet)
  meshConnected: boolean | null;      // alarm_connected_mesh (true = i mesh)
  deviceRole: string | null;          // "master" | "slave"
  signal24: string | null;            // "Good" / "Fair" osv 2.4 GHz
  signal5: string | null;             // 5 GHz
  wifiBand: string | null;            // "WiFi 2.4 GHz + WiFi 5 GHz"
  uptime: number | null;              // sekunder
  driver: string | null;
  class: string | null;
  capabilities: Record<string, CapValue>;
};

export type SpeedPoint = { ts: string; download: number | null; upload: number | null };

export type NetworkSnapshotResult = {
  ok: boolean;
  error?: string;
  generatedAt: string;
  mainRouter: NetworkDevice | null;
  routers: NetworkDevice[];
  clients: NetworkDevice[];
  others: NetworkDevice[];
  allDevices: NetworkDevice[];
  topMostSeen: { device_id: string; device_name: string | null; samples: number; last_seen: string }[];
  recentEvents: { device_id: string; device_name: string | null; event: "connect" | "disconnect"; ts: string }[];
  totalsLast24h: {
    connectedClients: number;
    totalSamples: number;
    downloadKbsAvg: number | null;
    uploadKbsAvg: number | null;
  };
  speedHistory: SpeedPoint[];
};

function classify(d: any): NetworkDevice["kind"] {
  const name = String(d.name ?? "").toLowerCase();
  const driver = String(d.driverUri ?? d.driverId ?? d.driver?.uri ?? d.driver?.id ?? "").toLowerCase();
  const cls = String(d.class ?? "").toLowerCase();
  if (
    driver.includes("deco") ||
    driver.includes("tp-link") ||
    driver.includes("tplink") ||
    name.includes("deco") ||
    name.includes("xe75") ||
    cls.includes("internetgateway")
  ) {
    return "router";
  }
  if (driver.includes("wifi") || driver.includes("network") || driver.includes("router") || driver.includes("unifi")) {
    return "client";
  }
  if (cls === "light" || cls === "socket" || cls === "thermostat" || cls === "sensor" || cls === "lock" || cls === "speaker") {
    return "iot";
  }
  return "other";
}

function readNum(caps: any, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = caps?.[k]?.value;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
function readStr(caps: any, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = caps?.[k]?.value;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}
function readBool(caps: any, ...keys: string[]): boolean | null {
  for (const k of keys) {
    const v = caps?.[k]?.value;
    if (typeof v === "boolean") return v;
  }
  return null;
}

function mapDevice(d: any): NetworkDevice {
  const caps = d.capabilitiesObj ?? d.capabilities_obj ?? {};
  const kind = classify(d);
  const signal =
    readNum(caps, "measure_rssi", "rssi", "measure_signal_strength", "signal_dbm");
  const signalQuality =
    readStr(caps, "signal_strength", "wifi_signal_quality", "signal_quality") ??
    (typeof signal === "number" ? null : null);
  const watt = readNum(caps, "measure_power");

  const downloadKbs =
    readNum(caps, "meter_download_speed", "measure_download_speed", "meter_download", "download_speed", "wan_down") ??
    null;
  const uploadKbs =
    readNum(caps, "meter_upload_speed", "measure_upload_speed", "meter_upload", "upload_speed", "wan_up") ?? null;
  const cpu = readNum(caps, "measure_cpu_usage", "measure_cpu", "cpu_usage");
  const memory = readNum(caps, "measure_memory_usage", "measure_memory", "memory_usage");
  const clients = readNum(caps, "meter_connected_clients", "measure_connected_clients", "connected_clients", "clients_count");
  const ipAddress = readStr(caps, "ip_address", "wan_ip", "lan_ip");
  const master = readBool(caps, "is_master", "alarm_master", "master");
  const wired = readBool(caps, "is_wired", "ethernet", "wired");
  const wanConnected = readBool(caps, "alarm_wan_connected_ipv4", "alarm_wan_connected", "wan_connected", "wan_connected_ipv4");
  const meshConnected = readBool(caps, "alarm_connected_mesh", "alarm_mesh_connected", "mesh_connected", "connected_to_mesh");
  const deviceRole = readStr(caps, "device_role", "role", "deco_role") ?? (master === true ? "master" : master === false ? "slave" : null);
  const signal24 = readStr(caps, "signal_strength_2_4_ghz", "signal_2_4_ghz", "wifi_signal_2_4");
  const signal5 = readStr(caps, "signal_strength_5_ghz", "signal_5_ghz", "wifi_signal_5");
  const wifiBand = readStr(caps, "wifi_band", "wifi_bands", "wifi_mode");
  const uptime = readNum(caps, "uptime", "measure_uptime", "device_uptime");

  const capSummary: Record<string, CapValue> = {};
  for (const [k, v] of Object.entries(caps)) {
    const val = (v as any)?.value;
    capSummary[k] =
      typeof val === "string" || typeof val === "number" || typeof val === "boolean" ? val : null;
  }

  return {
    id: d.id ?? d._id ?? "",
    name: d.name ?? "Ukjent",
    kind,
    zone: d.zone ?? null,
    available: d.available !== false,
    signal,
    signalQuality,
    watt,
    downloadKbs,
    uploadKbs,
    cpu,
    memory,
    clients,
    ipAddress,
    master,
    wired,
    wanConnected,
    meshConnected,
    deviceRole,
    signal24,
    signal5,
    wifiBand,
    uptime,
    driver: String(d.driverUri ?? d.driverId ?? d.driver?.uri ?? d.driver?.id ?? "") || null,
    class: d.class ?? null,
    capabilities: capSummary,
  };
}

async function logSnapshot(devices: NetworkDevice[]) {
  if (devices.length === 0) return;
  const rows = devices.map((d) => ({
    device_id: d.id,
    device_name: d.name,
    kind: d.kind === "iot" || d.kind === "other" ? "other" : d.kind,
    available: d.available,
    signal: d.signal,
    signal_quality: d.signalQuality,
    watt: d.watt,
    zone: d.zone,
    download_kbs: d.downloadKbs,
    upload_kbs: d.uploadKbs,
    cpu: d.cpu,
    memory: d.memory,
    clients: d.clients,
    ip_address: d.ipAddress,
    master: d.master,
    wan_connected: d.wanConnected,
    mesh_connected: d.meshConnected,
    device_role: d.deviceRole,
    signal_2_4: d.signal24,
    signal_5: d.signal5,
    wifi_band: d.wifiBand,
    uptime_s: d.uptime,
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
    let allDevices: NetworkDevice[] = [];
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
            allDevices.push(m);
            if (m.kind === "router") routers.push(m);
            else if (m.kind === "client") clients.push(m);
            else others.push(m);
          }
          try {
            await logSnapshot(routers.concat(clients));
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

    // Velg hoved-ruter
    const mainRouter =
      routers.find((r) => r.master === true) ??
      routers.find((r) => r.ipAddress && r.ipAddress.startsWith("192.")) ??
      routers[0] ??
      null;

    // Aggregeringer
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { data: aggRows } = await supabaseAdmin
      .from("network_snapshots")
      .select("device_id, device_name, ts, available, download_kbs, upload_kbs, raw")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(5000);

    const byDevice = new Map<string, { name: string | null; samples: number; last: string }>();
    let totalSamples = 0;
    const connectedNow = new Set<string>();
    let dlSum = 0,
      dlN = 0,
      upSum = 0,
      upN = 0;
    for (const r of aggRows ?? []) {
      totalSamples++;
      const cur = byDevice.get(r.device_id) ?? { name: r.device_name, samples: 0, last: r.ts };
      cur.samples++;
      if (r.ts > cur.last) cur.last = r.ts;
      byDevice.set(r.device_id, cur);
      if (r.available && r.ts === cur.last) connectedNow.add(r.device_id);
      const raw = (r.raw ?? {}) as any;
      if (typeof raw._download === "number") {
        dlSum += raw._download;
        dlN++;
      }
      if (typeof raw._upload === "number") {
        upSum += raw._upload;
        upN++;
      }
    }
    const topMostSeen = [...byDevice.entries()]
      .map(([device_id, v]) => ({ device_id, device_name: v.name, samples: v.samples, last_seen: v.last }))
      .sort((a, b) => b.samples - a.samples)
      .slice(0, 10);

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

    // Speed history for main router (siste 60 punkter)
    let speedHistory: SpeedPoint[] = [];
    if (mainRouter) {
      const points = (aggRows ?? [])
        .filter((r) => r.device_id === mainRouter.id)
        .slice(0, 60)
        .reverse()
        .map((r) => {
          const raw = (r.raw ?? {}) as any;
          return {
            ts: r.ts,
            download: typeof raw._download === "number" ? raw._download : null,
            upload: typeof raw._upload === "number" ? raw._upload : null,
          };
        });
      speedHistory = points;
    }

    return {
      ok: !error,
      error,
      generatedAt,
      mainRouter,
      routers,
      clients,
      others,
      allDevices,
      topMostSeen,
      recentEvents: recentEvents.slice(0, 30),
      totalsLast24h: {
        connectedClients: connectedNow.size,
        totalSamples,
        downloadKbsAvg: dlN ? dlSum / dlN : null,
        uploadKbsAvg: upN ? upSum / upN : null,
      },
      speedHistory,
    };
  },
);

import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { getValidConnection, getHomeyRawSnapshot, fetchHomeyInsightsLog } from "@/lib/homey.functions";

// Load withApiLog only on the server (samme mønster som homey.functions.ts)
const loadApiLog = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> =>
    import("@/lib/api-call-log.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/api-call-log.server")> =>
      Promise.resolve({
        withApiLog: (_g: string, _n: string, fn: any) => fn,
      } as unknown as typeof import("@/lib/api-call-log.server")),
  );
const { withApiLog } = await loadApiLog();

export type RadonSample = { t: string; v: number };

export type RadonDevice = {
  deviceId: string;
  name: string;
  zone: string | null;
  current: number | null;
  unit: string;
  lastUpdated: string | null;
  min30: number | null;
  max30: number | null;
  avg30: number | null;
  daily14: RadonSample[]; // dagsverdier (avg per dag) siste 14 dager
};

export type RadonStatusResult = {
  ok: boolean;
  error?: string;
  devices: RadonDevice[];
  fetchedAt: string;
};

// Navn vi leter etter (case-insensitiv, tolererer "radeon"/"radon")
const TARGETS = [
  { match: /home\s*[-–]\s*rade?on/i, label: "Soverom" },
  { match: /rade?on\s*måler/i, label: "Stua" },
];

function pickCap(d: any): { value: number | null; unit: string; ts: string | null } {
  const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
  const cap = caps?.measure_radon ?? caps?.measure_radon_long_term ?? null;
  if (!cap) return { value: null, unit: "Bq/m³", ts: null };
  const v = typeof cap.value === "number" ? cap.value : null;
  const unit = typeof cap.units === "string" ? cap.units : "Bq/m³";
  const t = cap.lastUpdated ?? cap.last_updated ?? cap.lastChanged ?? null;
  return { value: v, unit, ts: typeof t === "string" ? t : typeof t === "number" ? new Date(t).toISOString() : null };
}

function pointsFromLog(log: any): RadonSample[] {
  if (!log || log.__error) return [];
  const values: any[] = log?.values ?? log?.data ?? [];
  if (!Array.isArray(values)) return [];
  return values
    .map((p) => {
      const t = p?.t ?? p?.time ?? p?.timestamp;
      const v = typeof (p?.v ?? p?.value) === "number" ? (p.v ?? p.value) : null;
      if (!t || v == null || !Number.isFinite(v)) return null;
      return { t: new Date(t).toISOString(), v: Number(v) };
    })
    .filter((p): p is RadonSample => p !== null);
}

function dailyAggregate(points: RadonSample[], days: number): RadonSample[] {
  const now = Date.now();
  const dayMs = 86400000;
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const ts = new Date(p.t).getTime();
    if (now - ts > days * dayMs + dayMs) continue;
    const key = new Date(ts).toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += p.v;
    b.n += 1;
    buckets.set(key, b);
  }
  const out: RadonSample[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const key = d.toISOString().slice(0, 10);
    const b = buckets.get(key);
    out.push({ t: key, v: b ? b.sum / b.n : NaN });
  }
  return out;
}

export const getRadonStatus = createServerFn({ method: "GET" }).handler(
  withApiLog("homey", "getRadonStatus", async (): Promise<RadonStatusResult> => {
  const fetchedAt = new Date().toISOString();
  const conn = await getValidConnection();
  if (!conn) return { ok: false, error: "Ingen Homey-tilkobling", devices: [], fetchedAt };
  const raw = await getHomeyRawSnapshot(conn);
  if (!raw) return { ok: false, error: "Klarte ikke hente Homey-snapshot", devices: [], fetchedAt };

  const zonesById: Record<string, string> = {};
  for (const z of raw.zonesRaw ?? []) {
    zonesById[String((z as any)?.id ?? "")] = String((z as any)?.name ?? "");
  }

  const matched: RadonDevice[] = [];
  for (const d of raw.devicesRaw ?? []) {
    const name = String((d as any)?.name ?? "");
    if (!TARGETS.some((t) => t.match.test(name))) continue;
    const caps = (d as any)?.capabilitiesObj ?? (d as any)?.capabilities_obj ?? {};
    if (!("measure_radon" in caps) && !("measure_radon_long_term" in caps)) continue;
    const id = String((d as any)?.id ?? "");
    if (!id) continue;
    const { value, unit, ts } = pickCap(d);
    matched.push({
      deviceId: id,
      name,
      zone: zonesById[String((d as any)?.zone ?? "")] ?? null,
      current: value,
      unit,
      lastUpdated: ts,
      min30: null,
      max30: null,
      avg30: null,
      daily14: [],
    });
  }

  // Hent insights per device (parallelt)
  await Promise.all(
    matched.map(async (dev) => {
      try {
        const capId = "measure_radon";
        const [log31, log14] = await Promise.all([
          fetchHomeyInsightsLog(dev.deviceId, capId, "last31Days").catch(() => null),
          fetchHomeyInsightsLog(dev.deviceId, capId, "last14Days").catch(() => null),
        ]);
        const pts31 = pointsFromLog(log31);
        if (pts31.length > 0) {
          let mn = Infinity, mx = -Infinity, sum = 0;
          for (const p of pts31) {
            if (p.v < mn) mn = p.v;
            if (p.v > mx) mx = p.v;
            sum += p.v;
          }
          dev.min30 = Number.isFinite(mn) ? mn : null;
          dev.max30 = Number.isFinite(mx) ? mx : null;
          dev.avg30 = pts31.length ? sum / pts31.length : null;
        }
        const pts14 = pointsFromLog(log14);
        dev.daily14 = dailyAggregate(pts14.length ? pts14 : pts31, 14);
      } catch {
        // ignore
      }
    }),
  );

    return { ok: true, devices: matched, fetchedAt };
  }),
);

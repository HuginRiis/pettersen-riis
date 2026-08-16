import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { getValidConnection, getHomeyRawSnapshot, fetchHomeyInsightsLog } from "@/lib/homey.functions";

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

export type VocSample = { t: string; v: number };

export type VocDevice = {
  deviceId: string;
  name: string;
  zone: string | null;
  current: number | null;
  unit: string;
  lastUpdated: string | null;
  min30: number | null;
  max30: number | null;
  avg30: number | null;
  hourly48: VocSample[]; // siste 48 timer (timesnitt)
  daily14: VocSample[]; // siste 14 dager (dagsnitt)
};

export type VocStatusResult = {
  ok: boolean;
  error?: string;
  devices: VocDevice[];
  fetchedAt: string;
};

// Vi henter VOC fra "radeon måler" (stua). Match case-insensitivt.
const TARGETS = [/rade?on\s*måler/i];

function pickVoc(d: any): { value: number | null; unit: string; ts: string | null } {
  const caps = d?.capabilitiesObj ?? d?.capabilities_obj ?? {};
  const cap = caps?.measure_voc ?? caps?.measure_tvoc ?? null;
  if (!cap) return { value: null, unit: "ppb", ts: null };
  const v = typeof cap.value === "number" ? cap.value : null;
  const unit = typeof cap.units === "string" ? cap.units : "ppb";
  const t = cap.lastUpdated ?? cap.last_updated ?? cap.lastChanged ?? null;
  return {
    value: v,
    unit,
    ts: typeof t === "string" ? t : typeof t === "number" ? new Date(t).toISOString() : null,
  };
}

function pointsFromLog(log: any): VocSample[] {
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
    .filter((p): p is VocSample => p !== null);
}

function bucketAggregate(points: VocSample[], buckets: number, bucketMs: number): VocSample[] {
  const now = Date.now();
  const map = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const ts = new Date(p.t).getTime();
    const age = now - ts;
    if (age < 0 || age > buckets * bucketMs + bucketMs) continue;
    const key = Math.floor(ts / bucketMs);
    const b = map.get(key) ?? { sum: 0, n: 0 };
    b.sum += p.v;
    b.n += 1;
    map.set(key, b);
  }
  const out: VocSample[] = [];
  const nowKey = Math.floor(now / bucketMs);
  for (let i = buckets - 1; i >= 0; i--) {
    const k = nowKey - i;
    const b = map.get(k);
    out.push({ t: new Date(k * bucketMs).toISOString(), v: b ? b.sum / b.n : NaN });
  }
  return out;
}

// 10 min server-cache — VOC-kall gjør mange Homey Insights-kall (429-risiko).
const VOC_TTL_MS = 10 * 60_000;
const vg = globalThis as unknown as {
  __vocCache?: { at: number; value: VocStatusResult };
  __vocInflight?: Promise<VocStatusResult> | null;
};

export const getVocStatus = createServerFn({ method: "GET" }).handler(
  withApiLog("homey", "getVocStatus", async (): Promise<VocStatusResult> => {
    const cached = vg.__vocCache;
    if (cached && Date.now() - cached.at < VOC_TTL_MS) return cached.value;
    if (vg.__vocInflight) return vg.__vocInflight;

    const run = (async (): Promise<VocStatusResult> => {
    const fetchedAt = new Date().toISOString();
    const conn = await getValidConnection();
    if (!conn) return { ok: false, error: "Ingen Homey-tilkobling", devices: [], fetchedAt };
    const raw = await getHomeyRawSnapshot(conn);
    if (!raw) return { ok: false, error: "Klarte ikke hente Homey-snapshot", devices: [], fetchedAt };

    const zonesById: Record<string, string> = {};
    for (const z of raw.zonesRaw ?? []) {
      zonesById[String((z as any)?.id ?? "")] = String((z as any)?.name ?? "");
    }

    const matched: VocDevice[] = [];
    for (const d of raw.devicesRaw ?? []) {
      const name = String((d as any)?.name ?? "");
      if (!TARGETS.some((t) => t.test(name))) continue;
      const caps = (d as any)?.capabilitiesObj ?? (d as any)?.capabilities_obj ?? {};
      if (!("measure_voc" in caps) && !("measure_tvoc" in caps)) continue;
      const id = String((d as any)?.id ?? "");
      if (!id) continue;
      const { value, unit, ts } = pickVoc(d);
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
        hourly48: [],
        daily14: [],
      });
    }

    await Promise.all(
      matched.map(async (dev) => {
        try {
          const capId = "measure_voc";
          const [log31, log14, log48h] = await Promise.all([
            fetchHomeyInsightsLog(dev.deviceId, capId, "last31Days").catch(() => null),
            fetchHomeyInsightsLog(dev.deviceId, capId, "last14Days").catch(() => null),
            fetchHomeyInsightsLog(dev.deviceId, capId, "last2Days").catch(() => null),
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
          dev.daily14 = bucketAggregate(pts14.length ? pts14 : pts31, 14, 86400000);
          const pts48 = pointsFromLog(log48h);
          dev.hourly48 = bucketAggregate(pts48.length ? pts48 : pts14.length ? pts14 : pts31, 48, 3600000);
        } catch {
          // ignore
        }
      }),
    );

    return { ok: true, devices: matched, fetchedAt };
    })();

    vg.__vocInflight = run;
    try {
      const value = await run;
      if (value.ok) vg.__vocCache = { at: Date.now(), value };
      return value;
    } finally {
      vg.__vocInflight = null;
    }
  }),
);

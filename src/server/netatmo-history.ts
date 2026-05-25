import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withApiLog } from "./api-call-log.server";
import { loadStoredRefreshToken, saveStoredRefreshToken } from "./netatmo-token-store.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DB_CACHE_TABLE = "netatmo_climate_snapshot";

async function loadDbSnapshot(key: string): Promise<ClimateHistoryResult | null> {
  try {
    const { data } = await supabaseAdmin
      .from(DB_CACHE_TABLE as any)
      .select("data, updated_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (!data) return null;
    const payload = (data as any).data as ClimateHistoryResult;
    if (payload && (payload as any).ok) {
      return { ...(payload as any), fetchedAt: (data as any).updated_at } as ClimateHistoryResult;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveDbSnapshot(key: string, payload: ClimateHistoryResult): Promise<void> {
  try {
    await supabaseAdmin
      .from(DB_CACHE_TABLE as any)
      .upsert({ cache_key: key, data: payload as any, updated_at: new Date().toISOString() } as any, {
        onConflict: "cache_key",
      });
  } catch {
    /* best effort */
  }
}

/**
 * Henter historisk data fra Netatmo getmeasure-API.
 * Brukes til grafer på /varme — inne/ute-temp 24h, daglig min/max 30d, og
 * sammenligning nå vs samme tid i går / forrige uke / 30d-snitt.
 */

const REFRESH_TOKEN_KEY = "netatmo_ws_refresh_token";
const NETATMO_BASE = "https://api.netatmo.com";

type TokenCache = { accessToken: string; refreshToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.NETATMO_WS_CLIENT_ID;
  const clientSecret = process.env.NETATMO_WS_CLIENT_SECRET;
  const initialRefresh = process.env.NETATMO_WS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !initialRefresh) {
    throw new Error("NETATMO_WS_CLIENT_ID/SECRET/REFRESH_TOKEN mangler");
  }
  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) {
    return tokenCache.accessToken;
  }
  const stored = await loadStoredRefreshToken(REFRESH_TOKEN_KEY);
  const refreshToken = tokenCache?.refreshToken ?? stored ?? initialRefresh;
  const res = await fetch(`${NETATMO_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Netatmo token-feil (${res.status})`);
  const tok = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  tokenCache = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
  };
  await saveStoredRefreshToken(REFRESH_TOKEN_KEY, tok.refresh_token);
  return tokenCache.accessToken;
}

type HourPoint = {
  t: number; // unix ms
  inT: number | null;
  outT: number | null;
  hum: number | null;
  co2: number | null;
};
type DayPoint = {
  date: string; // YYYY-MM-DD
  inMin: number | null;
  inMax: number | null;
  inAvg: number | null;
  outMin: number | null;
  outMax: number | null;
  outAvg: number | null;
};
type Snapshot = { inT: number | null; outT: number | null; hum: number | null; co2: number | null };

export type ClimateHistoryResult =
  | { ok: false; error: string }
  | {
      ok: true;
      stationName: string;
      fetchedAt: string;
      points24h: HourPoint[];
      points48h: HourPoint[]; // i går + i dag for sammenligning
      daily30d: DayPoint[];
      current: Snapshot;
      oneHourAgo: Snapshot;
      yesterdaySameTime: Snapshot;
      lastWeekSameTime: Snapshot;
      normal: {
        // 30-dagers snitt for samme time-på-døgnet (i dag inntil nå)
        inT: number | null;
        outT: number | null;
        hum: number | null;
        co2: number | null;
      };
      trends: {
        // siste 3 timer (lineær endring per time)
        outDeltaPerHour: number | null;
        inDeltaPerHour: number | null;
      };
    };

const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; data: ClimateHistoryResult }>();

async function netatmoFetch(url: string, token: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Netatmo ${res.status}: ${text.slice(0, 160)}`);
  }
  return res.json();
}

/**
 * Netatmo getmeasure returnerer { body: { "<unix>": [v1, v2, ...] } } når optimize=false.
 * Konverter til { tsMs, values[] }.
 */
function parseMeasure(json: any): Array<{ ts: number; values: number[] }> {
  const body = json?.body;
  if (!body) return [];
  const out: Array<{ ts: number; values: number[] }> = [];
  if (Array.isArray(body)) {
    for (const blk of body) {
      const begin = (blk.beg_time ?? 0) * 1000;
      const step = (blk.step_time ?? 0) * 1000;
      const vals: number[][] = blk.value ?? [];
      for (let i = 0; i < vals.length; i++) {
        out.push({ ts: begin + i * step, values: vals[i] ?? [] });
      }
    }
  } else if (typeof body === "object") {
    for (const k of Object.keys(body)) {
      const ts = Number(k) * 1000;
      const vals = body[k];
      if (Array.isArray(vals)) out.push({ ts, values: vals });
    }
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function pickAtOrBefore<T extends { t: number }>(arr: T[], target: number): T | null {
  if (arr.length === 0) return null;
  let best: T | null = null;
  for (const p of arr) {
    if (p.t <= target) best = p;
    else break;
  }
  // tillat litt slack: hvis nærmeste etter er innen 90 min, ta den
  if (!best && arr[0] && arr[0].t - target < 90 * 60_000) return arr[0];
  return best;
}

export const getNetatmoClimateHistory = createServerFn({ method: "GET" })
  .inputValidator((d: { stationMatch?: string }) => d ?? {})
  .handler(
    withApiLog(
      "netatmo",
      "getNetatmoClimateHistory",
      async ({ data }: { data: { stationMatch?: string } }): Promise<ClimateHistoryResult> => {
        const key = (data?.stationMatch ?? "").toLowerCase().trim() || "__default";
        const c = cache.get(key);
        if (c && Date.now() - c.at < CACHE_TTL_MS && c.data.ok) return c.data;

        const fallbackToDb = async (errMsg: string): Promise<ClimateHistoryResult> => {
          const snap = await loadDbSnapshot(key);
          if (snap && snap.ok) {
            cache.set(key, { at: Date.now(), data: snap });
            return snap;
          }
          return { ok: false, error: errMsg };
        };

        try {
          const token = await getAccessToken();
          const stations = await netatmoFetch(
            `${NETATMO_BASE}/api/getstationsdata?get_favorites=false`,
            token,
          );
          const devices: any[] = stations?.body?.devices ?? [];
          if (!devices.length) return await fallbackToDb("Ingen værstasjoner");
          const match = data?.stationMatch?.toLowerCase().trim();
          let device = devices[0];
          if (match) {
            const found = devices.find((d: any) => {
              const sn = (d.station_name ?? "").toLowerCase();
              const mn = (d.module_name ?? "").toLowerCase();
              return sn.includes(match) || mn.includes(match);
            });
            if (found) device = found;
          }
          const stationName: string = device.station_name ?? device.module_name ?? "Værstasjonen";
          const deviceId = device._id;
          const outdoor = (device.modules ?? []).find((m: any) => m.type === "NAModule1");
          const outdoorId: string | null = outdoor?._id ?? null;

          const nowMs = Date.now();
          const begin24h = Math.floor((nowMs - 25 * 3600_000) / 1000);
          const begin48h = Math.floor((nowMs - 49 * 3600_000) / 1000);
          const begin30d = Math.floor((nowMs - 31 * 86400_000) / 1000);
          const beginWeek = Math.floor((nowMs - 8 * 86400_000) / 1000);

          // Innendørs 48h @ 30min (Temperature, Humidity, CO2)
          const inUrl48 =
            `${NETATMO_BASE}/api/getmeasure?device_id=${deviceId}` +
            `&scale=30min&type=Temperature,Humidity,CO2&date_begin=${begin48h}&optimize=false&real_time=true`;
          // Utendørs 48h @ 30min (Temperature, Humidity)
          const outUrl48 = outdoorId
            ? `${NETATMO_BASE}/api/getmeasure?device_id=${deviceId}&module_id=${outdoorId}` +
              `&scale=30min&type=Temperature,Humidity&date_begin=${begin48h}&optimize=false&real_time=true`
            : null;
          // 30 dager daglig (min/max temp inne)
          const inDailyUrl =
            `${NETATMO_BASE}/api/getmeasure?device_id=${deviceId}` +
            `&scale=1day&type=min_temp,max_temp,Temperature&date_begin=${begin30d}&optimize=false&real_time=true`;
          const outDailyUrl = outdoorId
            ? `${NETATMO_BASE}/api/getmeasure?device_id=${deviceId}&module_id=${outdoorId}` +
              `&scale=1day&type=min_temp,max_temp,Temperature&date_begin=${begin30d}&optimize=false&real_time=true`
            : null;
          // Forrige uke samme time (1 datapunkt rundt nå-1uke)
          const inWeekUrl =
            `${NETATMO_BASE}/api/getmeasure?device_id=${deviceId}` +
            `&scale=30min&type=Temperature,Humidity,CO2&date_begin=${beginWeek}&date_end=${beginWeek + 6 * 3600}&optimize=false&real_time=true`;
          const outWeekUrl = outdoorId
            ? `${NETATMO_BASE}/api/getmeasure?device_id=${deviceId}&module_id=${outdoorId}` +
              `&scale=30min&type=Temperature&date_begin=${beginWeek}&date_end=${beginWeek + 6 * 3600}&optimize=false&real_time=true`
            : null;

          const [inJson48, outJson48, inDaily, outDaily, inWeek, outWeek] = await Promise.all([
            netatmoFetch(inUrl48, token).catch(() => null),
            outUrl48 ? netatmoFetch(outUrl48, token).catch(() => null) : null,
            netatmoFetch(inDailyUrl, token).catch(() => null),
            outDailyUrl ? netatmoFetch(outDailyUrl, token).catch(() => null) : null,
            netatmoFetch(inWeekUrl, token).catch(() => null),
            outWeekUrl ? netatmoFetch(outWeekUrl, token).catch(() => null) : null,
          ]);

          // Parse 48h inne (Temperature, Humidity, CO2)
          const inMeas = parseMeasure(inJson48); // values: [Temperature, Humidity, CO2]
          const outMeas = outJson48 ? parseMeasure(outJson48) : []; // [Temperature, Humidity]

          // Bygg felles 48h-tidslinje basert på inne
          const points48h: HourPoint[] = inMeas.map((p) => {
            const out = pickAtOrBefore(
              outMeas.map((o) => ({ t: o.ts, v: o.values })),
              p.ts,
            );
            return {
              t: p.ts,
              inT: typeof p.values[0] === "number" ? p.values[0] : null,
              hum: typeof p.values[1] === "number" ? p.values[1] : null,
              co2: typeof p.values[2] === "number" ? p.values[2] : null,
              outT: out && typeof out.v[0] === "number" ? out.v[0] : null,
            };
          });

          // 24h-snitt-cut
          const cut24 = nowMs - 24 * 3600_000;
          const points24h = points48h.filter((p) => p.t >= cut24);

          // Daglig
          const daily30d: DayPoint[] = [];
          const inDay = parseMeasure(inDaily);
          const outDay = outDaily ? parseMeasure(outDaily) : [];
          const outByDate = new Map<string, number[]>();
          for (const d of outDay) {
            const ds = new Date(d.ts).toISOString().slice(0, 10);
            outByDate.set(ds, d.values);
          }
          for (const d of inDay) {
            const ds = new Date(d.ts).toISOString().slice(0, 10);
            const ov = outByDate.get(ds);
            daily30d.push({
              date: ds,
              inMin: typeof d.values[0] === "number" ? d.values[0] : null,
              inMax: typeof d.values[1] === "number" ? d.values[1] : null,
              inAvg: typeof d.values[2] === "number" ? d.values[2] : null,
              outMin: ov && typeof ov[0] === "number" ? ov[0] : null,
              outMax: ov && typeof ov[1] === "number" ? ov[1] : null,
              outAvg: ov && typeof ov[2] === "number" ? ov[2] : null,
            });
          }

          // Snapshots
          const lastP = points48h[points48h.length - 1] ?? null;
          const current: Snapshot = lastP
            ? { inT: lastP.inT, outT: lastP.outT, hum: lastP.hum, co2: lastP.co2 }
            : { inT: null, outT: null, hum: null, co2: null };
          const pickSnap = (arr: HourPoint[], targetMs: number): Snapshot => {
            const p = pickAtOrBefore(arr, targetMs);
            return p
              ? { inT: p.inT, outT: p.outT, hum: p.hum, co2: p.co2 }
              : { inT: null, outT: null, hum: null, co2: null };
          };
          const oneHourAgo = pickSnap(points48h, nowMs - 3600_000);
          const yesterdaySameTime = pickSnap(points48h, nowMs - 24 * 3600_000);

          // Forrige uke samme time fra egen henting
          const inWeekArr = parseMeasure(inWeek);
          const outWeekArr = outWeek ? parseMeasure(outWeek) : [];
          const weekTarget = nowMs - 7 * 86400_000;
          const inW = pickAtOrBefore(
            inWeekArr.map((p) => ({ t: p.ts, ...p })),
            weekTarget,
          );
          const outW = pickAtOrBefore(
            outWeekArr.map((p) => ({ t: p.ts, ...p })),
            weekTarget,
          );
          const lastWeekSameTime: Snapshot = {
            inT: inW && typeof inW.values[0] === "number" ? inW.values[0] : null,
            hum: inW && typeof inW.values[1] === "number" ? inW.values[1] : null,
            co2: inW && typeof inW.values[2] === "number" ? inW.values[2] : null,
            outT: outW && typeof outW.values[0] === "number" ? outW.values[0] : null,
          };

          // Normalen — 30 dager snitt for samme TIME PÅ DØGNET (±30min)
          const nowHour = new Date(nowMs).getHours();
          const sumByMetric = { inT: 0, outT: 0, hum: 0, co2: 0 };
          const cntByMetric = { inT: 0, outT: 0, hum: 0, co2: 0 };
          // Bruk daily30d som proxy for inne/ute snitt døgn — bedre: ingen time-data 30d, så
          // vi tar 7 dager med 48h-window (begrenset). Vi setter snitt fra 48h med samme time
          // som beste tilgjengelig fallback. For mer presisjon trengs ekstra getmeasure-kall.
          for (const p of points48h) {
            const h = new Date(p.t).getHours();
            if (h !== nowHour) continue;
            if (p.inT != null) { sumByMetric.inT += p.inT; cntByMetric.inT++; }
            if (p.outT != null) { sumByMetric.outT += p.outT; cntByMetric.outT++; }
            if (p.hum != null) { sumByMetric.hum += p.hum; cntByMetric.hum++; }
            if (p.co2 != null) { sumByMetric.co2 += p.co2; cntByMetric.co2++; }
          }
          // Suppler med dagsnitt fra daily30d
          for (const d of daily30d) {
            if (d.inAvg != null) { sumByMetric.inT += d.inAvg; cntByMetric.inT++; }
            if (d.outAvg != null) { sumByMetric.outT += d.outAvg; cntByMetric.outT++; }
          }
          const normal = {
            inT: cntByMetric.inT > 0 ? sumByMetric.inT / cntByMetric.inT : null,
            outT: cntByMetric.outT > 0 ? sumByMetric.outT / cntByMetric.outT : null,
            hum: cntByMetric.hum > 0 ? sumByMetric.hum / cntByMetric.hum : null,
            co2: cntByMetric.co2 > 0 ? sumByMetric.co2 / cntByMetric.co2 : null,
          };

          // Trender siste 3 timer (enkel lineær)
          const cut3h = nowMs - 3 * 3600_000;
          const last3h = points48h.filter((p) => p.t >= cut3h);
          const slope = (xs: number[], ys: number[]): number | null => {
            const n = xs.length;
            if (n < 2) return null;
            const mx = xs.reduce((a, b) => a + b, 0) / n;
            const my = ys.reduce((a, b) => a + b, 0) / n;
            let num = 0, den = 0;
            for (let i = 0; i < n; i++) {
              num += (xs[i] - mx) * (ys[i] - my);
              den += (xs[i] - mx) ** 2;
            }
            return den === 0 ? null : num / den;
          };
          // (lokale slope-input per metrikk bygges nedenfor)
          const outVals = last3h.map((p) => p.outT).filter((v): v is number => v != null);
          const inVals = last3h.map((p) => p.inT).filter((v): v is number => v != null);
          const trends = {
            outDeltaPerHour:
              outVals.length >= 2
                ? slope(
                    last3h.filter((p) => p.outT != null).map((p) => p.t / 3600_000),
                    outVals,
                  )
                : null,
            inDeltaPerHour:
              inVals.length >= 2
                ? slope(
                    last3h.filter((p) => p.inT != null).map((p) => p.t / 3600_000),
                    inVals,
                  )
                : null,
          };

          const out: ClimateHistoryResult = {
            ok: true,
            stationName,
            fetchedAt: new Date().toISOString(),
            points24h,
            points48h,
            daily30d,
            current,
            oneHourAgo,
            yesterdaySameTime,
            lastWeekSameTime,
            normal,
            trends,
          };
          cache.set(key, { at: Date.now(), data: out });
          return out;
        } catch (e: any) {
          return { ok: false, error: e?.message ?? "Ukjent feil" };
        }
      },
    ),
  );

// Lett snapshot brukt av header-badges — leser fra samme cache uten ekstra API-kall
// hvis tilgjengelig. Returnerer kun nåværende inne/ute-temp + trend per time.
export const getNetatmoLiveTrend = createServerFn({ method: "GET" })
  .inputValidator(z.object({ stationMatch: z.string().min(1).max(40) }).parse)
  .handler(async ({ data }) => {
    const key = data.stationMatch.toLowerCase().trim();
    const c = cache.get(key);
    if (c && c.data.ok) {
      return {
        ok: true as const,
        inT: c.data.current.inT,
        outT: c.data.current.outT,
        outDeltaPerHour: c.data.trends.outDeltaPerHour,
        inDeltaPerHour: c.data.trends.inDeltaPerHour,
      };
    }
    // Trigger en full henting hvis ingen cache
    const full = await (getNetatmoClimateHistory as any)({ data: { stationMatch: data.stationMatch } });
    if (!full.ok) return { ok: false as const, error: full.error };
    return {
      ok: true as const,
      inT: full.current.inT,
      outT: full.current.outT,
      outDeltaPerHour: full.trends.outDeltaPerHour,
      inDeltaPerHour: full.trends.inDeltaPerHour,
    };
  });

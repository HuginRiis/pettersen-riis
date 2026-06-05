// Klient-trygge serverFn-wrappere for API-kall-logg.
import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_air_quality_fetch_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/air-quality-fetch.server")> => import("@/lib/air-quality-fetch.server"))
  .client((): Promise<typeof import("@/lib/air-quality-fetch.server")> => Promise.resolve({} as unknown as typeof import("@/lib/air-quality-fetch.server")));
const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> => import("@/lib/api-call-log.server"))
  .client((): Promise<typeof import("@/lib/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/lib/api-call-log.server")));
const { computeApiCallSummary } = await __load_api_call_log_server();
import type { ApiCallSummary } from "@/lib/api-call-log.server";

const FIXED_OPEN_METEO_PANEL_LOCS = [
  { lat: 59.1789, lon: 9.5732 }, // Borgen · Tollnes, Skien
  { lat: 59.91, lon: 9.07 }, // Hytta · Lyngdal i Numedal
];

export const getApiCallLog = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiCallSummary> => {
    return computeApiCallSummary();
  },
);

export type ApiErrorEntry = {
  id: string;
  source: string;
  endpoint: string;
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: string | null;
  called_at: string;
};

export type ApiErrorLog = {
  fetchedAt: number;
  windowHours: number;
  errors: ApiErrorEntry[];
  countsBySource: Array<{ source: string; count: number }>;
};

export const getApiErrorLog = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        hours: z.number().int().min(1).max(24 * 30).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        source: z.string().min(1).max(64).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<ApiErrorLog> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hours = data.hours ?? 72;
    const limit = data.limit ?? 200;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    let q = (supabaseAdmin.from("api_call_log") as any)
      .select("id,source,endpoint,status_code,duration_ms,error_message,metadata,called_at")
      .eq("ok", false)
      .gte("called_at", since)
      .order("called_at", { ascending: false })
      .limit(limit);
    if (data.source) q = q.eq("source", data.source);

    const { data: rows, error } = (await q) as {
      data: Array<Omit<ApiErrorEntry, "metadata"> & { metadata: unknown }> | null;
      error: { message?: string } | null;
    };

    if (error) {
      console.error("[api-error-log] query failed", error);
      return { fetchedAt: Date.now(), windowHours: hours, errors: [], countsBySource: [] };
    }

    const errors: ApiErrorEntry[] = (rows ?? []).map((r) => ({
      id: r.id,
      source: r.source,
      endpoint: r.endpoint,
      status_code: r.status_code,
      duration_ms: r.duration_ms,
      error_message: r.error_message,
      called_at: r.called_at,
      metadata: r.metadata == null ? null : JSON.stringify(r.metadata),
    }));

    // Tellinger per kilde må hentes separat fra hele vinduet — ellers blir
    // mindre kilder (renovasjon, geoip, kassal …) skjøvet ut av limit når
    // én støyende kilde (f.eks. gardena) dominerer.
    let countsBySource: Array<{ source: string; count: number }> = [];
    try {
      let cq = (supabaseAdmin.from("api_call_log") as any)
        .select("source")
        .eq("ok", false)
        .gte("called_at", since)
        .limit(10_000);
      if (data.source) cq = cq.eq("source", data.source);
      const { data: cRows } = (await cq) as { data: Array<{ source: string }> | null };
      const cm = new Map<string, number>();
      for (const r of cRows ?? []) cm.set(r.source, (cm.get(r.source) ?? 0) + 1);
      countsBySource = Array.from(cm.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
    } catch (e) {
      console.warn("[api-error-log] counts query failed", e);
      const map = new Map<string, number>();
      for (const r of errors) map.set(r.source, (map.get(r.source) ?? 0) + 1);
      countsBySource = Array.from(map.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
    }

    return { fetchedAt: Date.now(), windowHours: hours, errors, countsBySource };
  });

// Trigge en manuell oppdatering av en gitt kilde ved å kalle
// representative server-funksjoner. Returnerer hva som ble forsøkt.
export const refreshApiSource = createServerFn({ method: "POST" })
  .inputValidator((input: { source: string }) => {
    if (!input || typeof input.source !== "string") {
      throw new Error("source er påkrevd");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const { source } = data;
    const triggered: string[] = [];
    const errors: Array<{ endpoint: string; message: string }> = [];

    const tryRun = async (label: string, fn: () => Promise<unknown>) => {
      triggered.push(label);
      try {
        await fn();
      } catch (e) {
        errors.push({
          endpoint: label,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    };

    if (source === "homey") {
      const m = await import("@/lib/homey.functions");
      await tryRun("getHomeySnapshot", () => m.getHomeySnapshot());
      await tryRun("getOutdoorLightsStatus", () => m.getOutdoorLightsStatus());
      await tryRun("getHomeAlarmStatus", () => m.getHomeAlarmStatus());
      await tryRun("getDoorsLocksSnapshot", () => m.getDoorsLocksSnapshot({ data: { force: true } }));
      await tryRun("getLivingRoomLightsState", () => m.getLivingRoomLightsState());
      await tryRun("getLivingRoomDevices", () => m.getLivingRoomDevices());
      await tryRun("getTollnesCameraSnapshot", () => m.getTollnesCameraSnapshot());
    } else if (source === "strava") {
      const m = await import("@/lib/strava.functions");
      const { withApiLog } = await __load_api_call_log_server();
      await tryRun("getStravaDashboard[arne]", () =>
        withApiLog("strava", "getStravaDashboard", () =>
          m.runStravaDashboard("arne"),
        )(),
      );
    } else if (source === "netatmo") {
      const m = await import("@/lib/netatmo-weather.functions");
      await tryRun("getNetatmoWeatherStation", () =>
        m.getNetatmoWeatherStation({ data: {} }),
      );
    } else if (source === "tibber") {
      const m = await import("@/lib/tibber.functions");
      await tryRun("getTibberFullData", () => m.getTibberFullData());
      await tryRun("getTibberMonthly", () => m.getTibberMonthly());
      await tryRun("getTibberHourly[tollnes]", () =>
        m.getTibberHourly({ data: { location: "tollnes" } }),
      );
      await tryRun("getTibberHourly[hytta]", () =>
        m.getTibberHourly({ data: { location: "hytta" } }),
      );
    } else if (source === "met") {
      const m = await import("@/lib/met-alerts.functions");
      await tryRun("getTelemarkAlerts", () => m.getTelemarkAlerts());
    } else if (source === "nrk") {
      const m = await import("@/lib/nrk-traffic");
      await tryRun("getNrkTraffic", () => m.getNrkTraffic());
    } else if (source === "spot") {
      const m = await import("@/lib/spot-price");
      await tryRun("getSpotPrices", () => m.getSpotPrices());
    } else if (source === "lightning") {
      const m = await import("@/lib/lightning.functions");
      await tryRun("getMetRadarSouthernNorway", () =>
        m.getMetRadarSouthernNorway(),
      );
      await tryRun("getTollnesAlerts", () => m.getTollnesAlerts());
    } else if (source === "flights") {
      const m = await import("@/lib/flights.functions");
      await tryRun("getNearbyFlights[tollnes]", () =>
        m.getNearbyFlights({ data: { location: "tollnes" } }),
      );
      await tryRun("getNearbyFlights[hytta]", () =>
        m.getNearbyFlights({ data: { location: "hytta" } }),
      );
    } else if (source === "open-meteo" || source === "air-quality" || source === "uv") {


      // Triggrer cache-oppvarmingen for Open-Meteo (pollen, luftkvalitet, UV).
      // Respekterer api-pause + blackout via fetchWithBackoff inne i warm-*.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const {
        warmAirQualityPanel,
        warmUvCloudPanel,
      } = await __load_air_quality_fetch_server();

      const dedupe = (rows: Array<{ lat: number; lon: number; enabled: boolean }>) => {
        const m = new Map<string, { lat: number; lon: number }>();
        for (const r of rows ?? []) {
          if (!r?.enabled) continue;
          if (typeof r.lat !== "number" || typeof r.lon !== "number") continue;
          const k = `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
          if (!m.has(k)) m.set(k, { lat: r.lat, lon: r.lon });
        }
        return [...m.values()];
      };

      const [{ data: aq }, { data: uv }] = await Promise.all([
        (supabaseAdmin.from("air_quality_notification_prefs" as never).select("lat,lon,enabled") as any),
        (supabaseAdmin.from("uv_notification_prefs" as never).select("lat,lon,enabled") as any),
      ]);
      const aqLocs = dedupe((aq ?? []) as any);
      const uvLocs = dedupe((uv ?? []) as any);
      const unionMap = new Map<string, { lat: number; lon: number }>();
      for (const l of [...aqLocs, ...uvLocs, ...FIXED_OPEN_METEO_PANEL_LOCS]) {
        unionMap.set(`${l.lat.toFixed(3)},${l.lon.toFixed(3)}`, l);
      }
      const unionLocs = [...unionMap.values()];
      const uvMap = new Map<string, { lat: number; lon: number }>();
      for (const l of [...uvLocs, ...FIXED_OPEN_METEO_PANEL_LOCS]) {
        uvMap.set(`${l.lat.toFixed(3)},${l.lon.toFixed(3)}`, l);
      }
      const uvCloudLocs = [...uvMap.values()];

      if (source === "open-meteo" || source === "air-quality") {
        for (const { lat, lon } of unionLocs) {
          await tryRun(`warmOpenMeteoCore[${lat},${lon}]`, () => warmAirQualityPanel(lat, lon));
        }
      }
      if (source === "open-meteo" || source === "uv") {
        for (const { lat, lon } of uvCloudLocs) {
          await tryRun(`warmUvCloudPanel[${lat},${lon}]`, () => warmUvCloudPanel(lat, lon));
        }
      }
    } else {
      throw new Error(`Ukjent kilde: ${source}`);
    }

    return { source, triggered, errors };
  });

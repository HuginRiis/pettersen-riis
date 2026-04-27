// Klient-trygge serverFn-wrappere for API-kall-logg.
import { createServerFn } from "@tanstack/react-start";
import {
  computeApiCallSummary,
  type ApiCallSummary,
} from "./api-call-log.server";

export const getApiCallLog = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiCallSummary> => {
    return computeApiCallSummary();
  },
);

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
      const m = await import("./homey");
      await tryRun("getHomeySnapshot", () => m.getHomeySnapshot());
      await tryRun("getOutdoorLightsStatus", () => m.getOutdoorLightsStatus());
      await tryRun("getHomeAlarmStatus", () => m.getHomeAlarmStatus());
      await tryRun("getDoorsLocksSnapshot", () => m.getDoorsLocksSnapshot());
      await tryRun("getLivingRoomLightsState", () => m.getLivingRoomLightsState());
      await tryRun("getLivingRoomDevices", () => m.getLivingRoomDevices());
      await tryRun("getTollnesCameraSnapshot", () => m.getTollnesCameraSnapshot());
    } else if (source === "strava") {
      const m = await import("./strava");
      const { withApiLog } = await import("./api-call-log.server");
      await tryRun("getStravaDashboard[arne]", () =>
        withApiLog("strava", "getStravaDashboard", () =>
          m.runStravaDashboard("arne"),
        )(),
      );
    } else if (source === "netatmo") {
      const m = await import("./netatmo-weather");
      await tryRun("getNetatmoWeatherStation", () =>
        m.getNetatmoWeatherStation({ data: {} }),
      );
    } else if (source === "tibber") {
      const m = await import("./tibber");
      await tryRun("getTibberMonthly", () => m.getTibberMonthly());
      await tryRun("getTibberHourly[tollnes]", () =>
        m.getTibberHourly({ data: { location: "tollnes" } }),
      );
      await tryRun("getTibberHourly[hytta]", () =>
        m.getTibberHourly({ data: { location: "hytta" } }),
      );
    } else if (source === "met") {
      const m = await import("./met-alerts");
      await tryRun("getTelemarkAlerts", () => m.getTelemarkAlerts());
    } else if (source === "nrk") {
      const m = await import("./nrk-traffic");
      await tryRun("getNrkTraffic", () => m.getNrkTraffic());
    } else if (source === "spot") {
      const m = await import("./spot-price");
      await tryRun("getSpotPrices", () => m.getSpotPrices());
    } else if (source === "lightning") {
      const m = await import("./lightning");
      await tryRun("getMetRadarSouthernNorway", () =>
        m.getMetRadarSouthernNorway(),
      );
      await tryRun("getTollnesAlerts", () => m.getTollnesAlerts());
    } else {
      throw new Error(`Ukjent kilde: ${source}`);
    }

    return { source, triggered, errors };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_air_quality_fetch_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/air-quality-fetch.server")> => import("@/server/air-quality-fetch.server"))
  .client((): Promise<typeof import("@/server/air-quality-fetch.server")> => Promise.resolve({} as unknown as typeof import("@/server/air-quality-fetch.server")));

const coordSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/**
 * Henter luftkvalitet fra Open-Meteo. Routes via server slik at kallet
 * blir logget i api_call_log med source "air-quality".
 */
export const fetchAirQualityPanel = createServerFn({ method: "GET" })
  .inputValidator((data) => coordSchema.parse(data))
  .handler(async ({ data }) => {
    const mod = await __load_air_quality_fetch_server();
    return mod.fetchAirQualityPanelData(data.lat, data.lon);
  });

/**
 * Henter UV + skydekke fra Open-Meteo (Air Quality API + Forecast API).
 */
export const fetchUvCloudPanel = createServerFn({ method: "GET" })
  .inputValidator((data) => coordSchema.parse(data))
  .handler(async ({ data }) => {
    const mod = await __load_air_quality_fetch_server();
    return mod.fetchUvCloudPanelData(data.lat, data.lon);
  });

/**
 * Henter pollen fra Open-Meteo via server-cache/backoff/pause.
 */
export const fetchOpenMeteoPollen = createServerFn({ method: "GET" })
  .inputValidator((data) => coordSchema.parse(data))
  .handler(async ({ data }) => {
    const mod = await __load_air_quality_fetch_server();
    return mod.fetchOpenMeteoPollenData(data.lat, data.lon);
  });

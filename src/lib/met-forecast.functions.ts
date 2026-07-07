import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UA = "house-riis-pettersen/1.0 (https://riis.cc)";

/**
 * Server-proxy for MET.no locationforecast/complete. Sikrer riktig
 * User-Agent (MET blokkerer generiske browser-UA) og gir oss ferske
 * data hver gang – bra for favoritt-flisene som ellers viste utdatert
 * vær når klientfetchen ble avvist / hentet fra HTTP-cache.
 */
export const getMetForecastComplete = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${data.lat.toFixed(4)}&lon=${data.lon.toFixed(4)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`MET feilet (${res.status})`);
    return (await res.json()) as any;
  });

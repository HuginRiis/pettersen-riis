import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

const __load = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/air-quality-history.server")> =>
    import("@/lib/air-quality-history.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/air-quality-history.server")> =>
      Promise.resolve({} as unknown as typeof import("@/lib/air-quality-history.server")),
  );

export type HistoryDayRange = 7 | 30 | 90 | 365 | 1825;

const inputSchema = z.object({
  locationKey: z.string().min(1).max(64),
  lat: z.number(),
  lon: z.number(),
  days: z.number().int().min(1).max(3650),
});

export const getAirQualityHistory = createServerFn({ method: "GET" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const mod = await __load();
    // Make sure DB has at least requested coverage. Cap initial backfill at 5y.
    const years = Math.min(5, Math.ceil(data.days / 365));
    let info: { backfilled: number; latest: string | null } = { backfilled: 0, latest: null };
    try {
      info = await mod.ensureHistory(data.locationKey, data.lat, data.lon, years);
    } catch (err) {
      // Non-fatal: still serve what we have
      console.warn("[aq-history] ensure failed", err);
    }
    const end = new Date();
    const start = new Date(end.getTime() - data.days * 86400_000);
    const rows = await mod.getHistoryRange(
      data.locationKey,
      start.toISOString(),
      end.toISOString(),
    );
    return { rows, backfilled: info.backfilled, latest: info.latest };
  });

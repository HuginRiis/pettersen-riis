import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

const __loadServer = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/batteries.server")> => import("@/lib/batteries.server"))
  .client(
    (): Promise<typeof import("@/lib/batteries.server")> =>
      Promise.resolve({} as unknown as typeof import("@/lib/batteries.server")),
  );

export type { BatteryItem, BatteryOverview, BatterySettings, BatterySource } from "@/lib/batteries.server";

export const getBatteryOverview = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ force: z.boolean().optional() }).optional().parse(data))
  .handler(async ({ data }) => {
    const { getBatteryOverviewCached } = await __loadServer();
    return getBatteryOverviewCached({ force: data?.force });
  });

export const getBatterySettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { loadBatterySettings } = await __loadServer();
  return loadBatterySettings();
});

export const updateBatterySettingsFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        enabled: z.boolean().optional(),
        threshold: z.number().min(1).max(100).optional(),
        recipient: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { saveBatterySettings } = await __loadServer();
    return saveBatterySettings(data);
  });

export const sendBatteryTestPushFn = createServerFn({ method: "POST" }).handler(async () => {
  const { sendBatteryTestPush } = await __loadServer();
  return sendBatteryTestPush();
});

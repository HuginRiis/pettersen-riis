import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

const __load = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/weather-summary-push.server")> => import("@/lib/weather-summary-push.server"))
  .client((): Promise<typeof import("@/lib/weather-summary-push.server")> => Promise.resolve({} as unknown as typeof import("@/lib/weather-summary-push.server")));

export const sendWeatherSummaryTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ prefId: z.string().uuid(), slot: z.union([z.literal(1), z.literal(2)]) }).parse(data),
  )
  .handler(async ({ data }) => {
    const mod = await __load();
    return mod.sendWeatherSummaryTest(data.prefId, data.slot);
  });

export const processWeatherSummaryPush = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await __load();
  return mod.processWeatherSummaryNotifications();
});

import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_air_quality_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/air-quality-push.server")> => import("@/lib/air-quality-push.server"))
  .client((): Promise<typeof import("@/lib/air-quality-push.server")> => Promise.resolve({} as unknown as typeof import("@/lib/air-quality-push.server")));

export const sendAirQualityTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        prefId: z.string().uuid(),
        metric: z.enum(["aqi", "pm25", "pm10", "no2", "o3", "so2", "dust"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const mod = await __load_air_quality_push_server();
    return mod.sendAirQualityTestNotification(data.prefId, data.metric);
  });

export const processAirQualityPush = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await __load_air_quality_push_server();
  return mod.processAirQualityNotifications();
});

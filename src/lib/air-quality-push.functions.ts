import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
    const mod = await import("@/server/air-quality-push.server");
    return mod.sendAirQualityTestNotification(data.prefId, data.metric);
  });

export const processAirQualityPush = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await import("@/server/air-quality-push.server");
  return mod.processAirQualityNotifications();
});

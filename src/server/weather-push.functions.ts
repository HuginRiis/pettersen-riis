import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const sendWeatherTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendWeatherTestNotification } = await import("./weather-push.server");
    return sendWeatherTestNotification(data.prefId);
  });

export const getWeatherForecast = createServerFn({ method: "GET" }).handler(async () => {
  const { computeWeatherForecast } = await import("./weather-push.server");
  return computeWeatherForecast();
});

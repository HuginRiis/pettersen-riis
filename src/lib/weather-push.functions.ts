import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_weather_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/weather-push.server")> => import("@/lib/weather-push.server"))
  .client((): Promise<typeof import("@/lib/weather-push.server")> => Promise.resolve({} as unknown as typeof import("@/lib/weather-push.server")));

export const sendWeatherTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendWeatherTestNotification } = await __load_weather_push_server();
    return sendWeatherTestNotification(data.prefId);
  });

export const getWeatherForecast = createServerFn({ method: "GET" }).handler(async () => {
  const { computeWeatherForecast } = await __load_weather_push_server();
  return computeWeatherForecast();
});

export const getUpcomingWeatherEvaluations = createServerFn({ method: "GET" }).handler(async () => {
  const { computeUpcomingWeatherEvaluations } = await __load_weather_push_server();
  return computeUpcomingWeatherEvaluations(31);
});

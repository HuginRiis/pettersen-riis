import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
const __load_garmin_thresholds_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/garmin-thresholds.server")> => import("@/lib/garmin-thresholds.server"))
  .client((): Promise<typeof import("@/lib/garmin-thresholds.server")> => Promise.resolve({} as unknown as typeof import("@/lib/garmin-thresholds.server")));
const { THRESHOLD_METRICS } = await __load_garmin_thresholds_server();
export const sendGarminThresholdTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendGarminThresholdTest } = await __load_garmin_thresholds_server();
    return sendGarminThresholdTest(data.prefId);
  });

export const getGarminThresholdMetrics = createServerFn({ method: "GET" }).handler(async () => {
  return THRESHOLD_METRICS;
});

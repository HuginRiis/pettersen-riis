import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { THRESHOLD_METRICS } from "./garmin-thresholds.server";

export const sendGarminThresholdTestPush = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prefId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendGarminThresholdTest } = await import("./garmin-thresholds.server");
    return sendGarminThresholdTest(data.prefId);
  });

export const getGarminThresholdMetrics = createServerFn({ method: "GET" }).handler(async () => {
  return THRESHOLD_METRICS;
});

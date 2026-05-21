import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  loadSlowPageConfig,
  saveSlowPageConfig,
  sendSlowPageLoadTest,
  type SlowPageConfig,
} from "./slow-page-push.server";

export const getSlowPageConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<SlowPageConfig> => loadSlowPageConfig(),
);

const routeRule = z.object({ route: z.string().min(1).max(200), ms: z.number().int().min(200).max(120_000) });

export const saveSlowPageConfigFn = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        enabled: z.boolean().optional(),
        recipient: z.string().min(1).max(60).optional(),
        default_ms: z.number().int().min(500).max(120_000).optional(),
        cooldown_min: z.number().int().min(5).max(1440).optional(),
        window_min: z.number().int().min(5).max(720).optional(),
        min_samples: z.number().int().min(1).max(100).optional(),
        only_mobile: z.boolean().optional(),
        routes: z.array(routeRule).max(200).optional(),
        slow_avg_enabled: z.boolean().optional(),
        slow_avg_ms: z.number().int().min(500).max(120_000).optional(),
      })
      .parse,
  )
  .handler(async ({ data }) => saveSlowPageConfig(data));

export const sendSlowPageLoadTestFn = createServerFn({ method: "POST" }).handler(async () =>
  sendSlowPageLoadTest(),
);

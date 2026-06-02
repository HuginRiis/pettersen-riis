// Klient-trygge serverFn for master API-blackout.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getBlackoutConfig,
  setBlackoutConfig,
  type BlackoutConfig,
} from "@/server/api-blackout.server";

export type { BlackoutConfig };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const getApiBlackoutConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlackoutConfig> => {
    return await getBlackoutConfig();
  },
);

export const setApiBlackoutConfig = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        enabled: z.boolean(),
        start_time: z.string().regex(TIME_RE, "Format må være HH:MM"),
        end_time: z.string().regex(TIME_RE, "Format må være HH:MM"),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<BlackoutConfig> => {
    await setBlackoutConfig(data.enabled, data.start_time, data.end_time);
    return await getBlackoutConfig();
  });

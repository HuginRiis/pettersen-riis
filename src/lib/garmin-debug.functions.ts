import { createServerFn } from "@tanstack/react-start";
import { garminGet } from "@/server/garmin.server";

export const debugEndurance = createServerFn({ method: "POST" })
  .inputValidator((d: { owner: "arne" | "rebekka"; day: string }) => d)
  .handler(async ({ data }) => {
    const r = await garminGet<any>(data.owner, `/metrics-service/metrics/endurancescore?calendarDate=${data.day}`);
    return r;
  });

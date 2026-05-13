import { createServerFn } from "@tanstack/react-start";
import { garminGet, type GarminOwner } from "./garmin.server";

export const debugGarminFitness = createServerFn({ method: "POST" })
  .inputValidator((d: { owner: GarminOwner; day: string }) => d)
  .handler(async ({ data }) => {
    const { owner, day } = data;
    const out: Record<string, unknown> = {};
    const tries: Array<[string, string]> = [
      ["endurance_query", `/metrics-service/metrics/endurancescore?calendarDate=${day}`],
      ["endurance_path", `/metrics-service/metrics/endurancescore/${day}`],
      ["fitnessage", `/fitnessage-service/fitnessage/${day}`],
      ["maxmet_range", `/metrics-service/metrics/maxmet/${day}/${day}`],
      ["maxmet_latest", `/metrics-service/metrics/maxmet/latest/${day}`],
    ];
    for (const [k, p] of tries) {
      try {
        out[k] = await garminGet(owner, p);
      } catch (e) {
        out[k] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    return JSON.parse(JSON.stringify(out)) as Record<string, any>;
  });

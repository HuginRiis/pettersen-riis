import { createFileRoute } from "@tanstack/react-router";
import { garminGet, type GarminOwner } from "@/server/garmin.server";

async function probe(owner: GarminOwner, day: string) {
  const out: Record<string, unknown> = { owner, day };
  for (const [k, p] of Object.entries({
    hr: `/wellness-service/wellness/dailyHeartRate?date=${day}`,
    stress: `/wellness-service/wellness/dailyStress/${day}`,
  })) {
    try {
      const r = await garminGet<any>(owner, p);
      out[k] = {
        ok: true,
        hr_len: r?.heartRateValues?.length ?? null,
        stress_len: r?.stressValuesArray?.length ?? null,
        bb_len: r?.bodyBatteryValuesArray?.length ?? null,
        keys: r ? Object.keys(r).slice(0, 12) : null,
      };
    } catch (e) {
      out[k] = { ok: false, error: (e as Error).message };
    }
  }
  return out;
}

export const Route = createFileRoute("/api/public/hooks/garmin-intraday-debug")({
  server: {
    handlers: {
      GET: async () => {
        const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const a = await probe("arne", day);
        const r = await probe("rebekka", day);
        return Response.json({ arne: a, rebekka: r });
      },
    },
  },
});

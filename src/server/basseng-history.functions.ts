import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BassengHistoryPoint = {
  ts: string;
  pool_temp: number | null;
  outdoor_temp: number | null;
  watts: number | null;
};

export type BassengHistoryResult = {
  points: BassengHistoryPoint[];
  hours: number;
};

const ALLOWED_HOURS = new Set([24, 72, 168]);

export const getBassengHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { hours?: number } | undefined) => ({
    hours: input?.hours && ALLOWED_HOURS.has(input.hours) ? input.hours : 72,
  }))
  .handler(async ({ data }): Promise<BassengHistoryResult> => {
    const since = new Date(Date.now() - data.hours * 3600_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("basseng_climate_samples" as any)
      .select("ts, pool_temp, outdoor_temp, watts")
      .gte("ts", since)
      .order("ts", { ascending: true })
      .limit(5000);

    const raw = ((rows ?? []) as any[]).map((r) => ({
      ts: String(r.ts),
      pool_temp: r.pool_temp == null ? null : Number(r.pool_temp),
      outdoor_temp: r.outdoor_temp == null ? null : Number(r.outdoor_temp),
      watts: r.watts == null ? null : Number(r.watts),
    })) as BassengHistoryPoint[];

    // Bucket til jevne intervaller for å holde grafen lesbar.
    const bucketMinutes = data.hours <= 24 ? 10 : data.hours <= 72 ? 30 : 60;
    const bucketMs = bucketMinutes * 60_000;
    const buckets = new Map<
      number,
      { pool: number[]; out: number[]; w: number[] }
    >();
    for (const r of raw) {
      const t = new Date(r.ts).getTime();
      const key = Math.floor(t / bucketMs) * bucketMs;
      let b = buckets.get(key);
      if (!b) {
        b = { pool: [], out: [], w: [] };
        buckets.set(key, b);
      }
      if (r.pool_temp != null) b.pool.push(r.pool_temp);
      if (r.outdoor_temp != null) b.out.push(r.outdoor_temp);
      if (r.watts != null) b.w.push(r.watts);
    }
    const avg = (xs: number[]) =>
      xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

    const points: BassengHistoryPoint[] = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([key, b]) => ({
        ts: new Date(key).toISOString(),
        pool_temp: avg(b.pool),
        outdoor_temp: avg(b.out),
        watts: avg(b.w),
      }));

    return { points, hours: data.hours };
  });

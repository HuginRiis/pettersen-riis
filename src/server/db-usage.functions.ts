import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const setCronJobActive = createServerFn({ method: "POST" })
  .inputValidator((input: { jobname: string; active: boolean }) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await (supabaseAdmin as any).rpc("set_cron_job_active", {
      _jobname: data.jobname,
      _active: data.active,
    });
    if (error) {
      console.error("[db-usage] set_cron_job_active failed", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  });

export type CronJobRow = {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_success: string | null;
  runs_24h: number;
  failed_24h: number;
  next_run?: string | null;
};

export type DataSyncRow = {
  name: string;
  schedule_label: string;
  last_run: string | null;
  next_run: string | null;
  ok: boolean;
  runs_24h: number;
  failed_24h: number;
  note?: string;
};

export type TableSizeRow = {
  table: string;
  size_pretty: string;
  bytes: number;
  rows: number;
};

export type DbUsageStats = {
  dbBytes: number;
  dbPretty: string;
  // Free tier limit (500 MB) — for visualisering
  limitBytes: number;
  limitLabel: string;
  tables: TableSizeRow[];
  cronJobs: CronJobRow[];
  dataSyncs: DataSyncRow[];
};

export const getDbUsage = createServerFn({ method: "GET" }).handler(
  async (): Promise<DbUsageStats> => {
    const sb = supabaseAdmin as any;

    const dbSizeQ = await sb.rpc("exec_sql", {}).maybeSingle?.();
    void dbSizeQ; // unused — vi bruker direkte SQL via REST under

    // Vi har ingen exec_sql RPC tilgjengelig; bruk PostgREST views vi allerede har.
    // I stedet bruker vi pg_stat / pg_database via rpc fallback: kjør via service role
    // gjennom direkte SQL i Supabase JS er ikke mulig — bruk supabase.from() summer i stedet.

    // Fall tilbake: hent total via en SQL-funksjon vi lager. Hvis den ikke finnes,
    // returner null verdier slik at panelet fortsatt fungerer.
    let dbBytes = 0;
    let tables: TableSizeRow[] = [];
    let cronJobs: CronJobRow[] = [];

    try {
      const { data, error } = await sb.rpc("get_db_usage_stats");
      if (!error && data) {
        dbBytes = Number(data.db_bytes ?? 0);
        tables = (data.tables ?? []).map((t: any) => ({
          table: t.table,
          size_pretty: t.size_pretty,
          bytes: Number(t.bytes ?? 0),
          rows: Number(t.rows ?? 0),
        }));
        cronJobs = (data.cron_jobs ?? []).map((c: any) => ({
          jobname: c.jobname,
          schedule: c.schedule,
          active: !!c.active,
          last_run: c.last_run ?? null,
          last_success: c.last_success ?? null,
          runs_24h: Number(c.runs_24h ?? 0),
          failed_24h: Number(c.failed_24h ?? 0),
        }));
      } else if (error) {
        console.warn("[db-usage] rpc failed:", error.message);
      }
    } catch (e) {
      console.warn("[db-usage] rpc threw:", e);
    }

    // Datasynk (ikke pg_cron, men trigget fra agenda-push hvert minutt)
    const dataSyncs: DataSyncRow[] = [];
    try {
      const [{ data: schedRow }, { data: lastSync }, { data: recent }] = await Promise.all([
        sb.from("notification_settings").select("value").eq("key", "garmin_sync_schedule").maybeSingle(),
        sb.from("garmin_sync_log").select("ran_at, ok").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
        sb.from("garmin_sync_log").select("ran_at, ok").gte("ran_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
      ]);
      const sched = (schedRow?.value as { interval_minutes?: number; first_local_hour?: number; last_local_hour?: number } | null) ?? null;
      const interval = sched?.interval_minutes ?? 1440;
      const firstH = sched?.first_local_hour ?? 6;
      const lastH = sched?.last_local_hour ?? 23;
      const lastRun = lastSync?.ran_at ?? null;
      const next_run = computeGarminNextRun(lastRun, interval, firstH, lastH);
      const runs24 = (recent ?? []).length;
      const failed24 = (recent ?? []).filter((r: any) => r.ok === false).length;
      const intervalLabel =
        interval >= 1440 ? "1 gang/dag" :
        interval % 60 === 0 ? `hver ${interval / 60}. time` :
        `hver ${interval}. min`;
      dataSyncs.push({
        name: "garmin-sync",
        schedule_label: `${intervalLabel} · vindu ${String(firstH).padStart(2, "0")}–${String(lastH).padStart(2, "0")}`,
        last_run: lastRun,
        next_run,
        ok: lastSync?.ok !== false,
        runs_24h: runs24,
        failed_24h: failed24,
        note: "Trigges fra agenda-push hvert minutt innenfor vinduet.",
      });
    } catch (e) {
      console.warn("[db-usage] garmin sync info failed:", e);
    }

    const limitBytes = 500 * 1024 * 1024; // 500 MB free tier soft limit
    return {
      dbBytes,
      dbPretty: prettyBytes(dbBytes),
      limitBytes,
      limitLabel: "500 MB",
      tables,
      cronJobs,
      dataSyncs,
    };
  },
);

function computeGarminNextRun(
  lastRunIso: string | null,
  intervalMinutes: number,
  firstLocalHour: number,
  lastLocalHour: number,
): string | null {
  const base = lastRunIso ? new Date(lastRunIso).getTime() : Date.now();
  let candidate = new Date(base + intervalMinutes * 60_000);
  if (candidate.getTime() < Date.now()) candidate = new Date(Date.now() + 30_000);
  // Iterativt skyv inn i lokalt vindu (Europe/Oslo).
  for (let i = 0; i < 8; i++) {
    const localHour = parseInt(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hour12: false }).format(candidate),
      10,
    );
    if (localHour >= firstLocalHour && localHour <= lastLocalHour) break;
    if (localHour < firstLocalHour) {
      candidate = new Date(candidate.getTime() + (firstLocalHour - localHour) * 3600_000);
    } else {
      const hoursToMidnight = 24 - localHour;
      candidate = new Date(candidate.getTime() + (hoursToMidnight + firstLocalHour) * 3600_000);
    }
  }
  return candidate.toISOString();
}


function prettyBytes(b: number): string {
  if (!b) return "0 B";
  const units = ["B", "kB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

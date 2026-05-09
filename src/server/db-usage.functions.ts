import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CronJobRow = {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
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
          runs_24h: Number(c.runs_24h ?? 0),
          failed_24h: Number(c.failed_24h ?? 0),
        }));
      } else if (error) {
        console.warn("[db-usage] rpc failed:", error.message);
      }
    } catch (e) {
      console.warn("[db-usage] rpc threw:", e);
    }

    const limitBytes = 500 * 1024 * 1024; // 500 MB free tier soft limit
    return {
      dbBytes,
      dbPretty: prettyBytes(dbBytes),
      limitBytes,
      limitLabel: "500 MB",
      tables,
      cronJobs,
    };
  },
);

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

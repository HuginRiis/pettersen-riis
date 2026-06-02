import { createServerFn } from "@tanstack/react-start";
const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();

export type DbDetailTable = {
  schema: string;
  table: string;
  bytes: number;
  table_bytes: number;
  index_bytes: number;
  toast_bytes: number;
  rows: number;
  inserts: number;
  updates: number;
  deletes: number;
  last_vacuum: string | null;
  last_analyze: string | null;
};

export type DbDetailView = {
  schema: string;
  view: string;
  is_materialized: boolean;
  bytes?: number;
};

export type DbDetailCron = {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_success: string | null;
  runs_24h: number;
  failed_24h: number;
};

export type DbDetailStats = {
  dbBytes: number;
  tables: DbDetailTable[];
  views: DbDetailView[];
  cronJobs: DbDetailCron[];
};

export const getDbDetailStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<DbDetailStats> => {
    const sb = supabaseAdmin as any;
    const { data, error } = await sb.rpc("get_db_detail_stats");
    if (error) {
      console.error("[db-detail] rpc failed", error);
      return { dbBytes: 0, tables: [], views: [], cronJobs: [] };
    }
    return {
      dbBytes: Number(data?.db_bytes ?? 0),
      tables: (data?.tables ?? []).map((t: any) => ({
        schema: t.schema,
        table: t.table,
        bytes: Number(t.bytes ?? 0),
        table_bytes: Number(t.table_bytes ?? 0),
        index_bytes: Number(t.index_bytes ?? 0),
        toast_bytes: Number(t.toast_bytes ?? 0),
        rows: Number(t.rows ?? 0),
        inserts: Number(t.inserts ?? 0),
        updates: Number(t.updates ?? 0),
        deletes: Number(t.deletes ?? 0),
        last_vacuum: t.last_vacuum ?? null,
        last_analyze: t.last_analyze ?? null,
      })),
      views: (data?.views ?? []).map((v: any) => ({
        schema: v.schema,
        view: v.view,
        is_materialized: !!v.is_materialized,
        bytes: v.bytes != null ? Number(v.bytes) : undefined,
      })),
      cronJobs: (data?.cron_jobs ?? []).map((c: any) => ({
        jobname: c.jobname,
        schedule: c.schedule,
        active: !!c.active,
        last_run: c.last_run ?? null,
        last_success: c.last_success ?? null,
        runs_24h: Number(c.runs_24h ?? 0),
        failed_24h: Number(c.failed_24h ?? 0),
      })),
    };
  },
);

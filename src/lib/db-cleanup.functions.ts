// Estimerer hvor mye plass man sparer i databasen ved ulike opprydningsstrategier.
import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();
const __loadAuth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> =>
    import("@/lib/house-auth.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/house-auth.server")> =>
      Promise.resolve({
        requireHouseAuth: async () => {},
        isHouseAuthenticated: async () => false,
      } as unknown as typeof import("@/lib/house-auth.server")),
  );
const { requireHouseAuth } = await __loadAuth();

type Candidate = {
  table: string;
  dateColumn: string;
  // Logger som ikke vises i noen graf eller UI-visning — trygt å slette alt.
  unused?: boolean;
  // Anbefalt levetid (dager) — alt eldre kan trygt slettes.
  recommendedDays?: number;
  note?: string;
};

const CANDIDATES: Candidate[] = [
  // Tabeller som ikke vises i noen graf/UI (kun audit/historikk):
  { table: "ai_search_log", dateColumn: "created_at", unused: true, note: "AI-søkelogg — ingen UI bruker historikken" },
  { table: "home_alarm_log", dateColumn: "changed_at", unused: true, note: "Alarm-historikk — vises ikke" },
  { table: "garbage_notification_log", dateColumn: "notified_at", unused: true, note: "Notifikasjons-audit" },
  { table: "plant_notification_log", dateColumn: "notified_at", unused: true, note: "Notifikasjons-audit" },
  { table: "tibber_notification_log", dateColumn: "notified_at", unused: true, note: "Notifikasjons-audit" },

  // Tabeller som brukes i grafer, men hvor gamle rader kan trimmes:
  { table: "api_call_log", dateColumn: "called_at", recommendedDays: 7, note: "Graf viser bare siste 24t" },
  { table: "network_snapshots", dateColumn: "ts", recommendedDays: 30, note: "Detaljerte snapshots — eldre enn 30d sjelden brukt" },
  { table: "homey_sensor_events", dateColumn: "ts", recommendedDays: 30, note: "Sensor-events oppsummeres etterhvert" },
  { table: "page_load_log", dateColumn: "created_at", recommendedDays: 30, note: "Sidelaster-statistikk" },
  { table: "push_send_log", dateColumn: "sent_at", recommendedDays: 60, note: "Push-logg" },
  { table: "vakttarn_events", dateColumn: "detected_at", recommendedDays: 90, note: "Kamera-hendelser" },
  { table: "visitor_login_attempts", dateColumn: "attempted_at", recommendedDays: 90, note: "Login-forsøk" },
  { table: "garmin_sync_log", dateColumn: "ran_at", recommendedDays: 14, note: "Sync-audit" },
  { table: "garmin_intraday", dateColumn: "updated_at", recommendedDays: 180, note: "Time-for-time data" },
];

export type DbCleanupRow = {
  table: string;
  dateColumn: string;
  totalBytes: number;
  totalRows: number;
  unusedRows: number;       // Alt → unused
  unusedBytes: number;
  recommendedRows: number;  // Eldre enn recommendedDays
  recommendedBytes: number;
  recommendedDays: number | null;
  month30Rows: number;      // Eldre enn 30 dager
  month30Bytes: number;
  unused: boolean;
  note?: string;
};

export type DbCleanupEstimate = {
  rows: DbCleanupRow[];
  totals: {
    unusedBytes: number;
    recommendedBytes: number;
    month30Bytes: number;
    /** Bredt 30-dagers estimat: alle public-tabeller + cron-historikk. */
    full30Bytes: number;
    /** pg_net responscache (net._http_response). */
    pgnetBytes: number;
    pgnetRows: number;
    dbBytes: number;
  };
  full30Rows: Array<{ table: string; dateColumn: string; oldRows: number; totalRows: number; estimatedBytes: number }>;
};

export const getDbCleanupEstimate = createServerFn({ method: "GET" }).handler(
  async (): Promise<DbCleanupEstimate> => {
    await requireHouseAuth();
    const sb = supabaseAdmin as any;

    // Hent total DB-størrelse + bredt 30-dagers estimat.
    let dbBytes = 0;
    let full30Bytes = 0;
    let full30Rows: DbCleanupEstimate["full30Rows"] = [];
    try {
      const { data, error } = await sb.rpc("get_db_30day_cleanup_estimate");
      if (error) console.warn("[db-cleanup] 30day rpc error:", error.message);
      if (data) {
        dbBytes = Number(data.db_bytes ?? 0);
        full30Bytes = Number(data.total_bytes ?? 0);
        full30Rows = (data.rows ?? []).map((r: any) => ({
          table: String(r.table),
          dateColumn: String(r.date_column),
          oldRows: Number(r.old_rows ?? 0),
          totalRows: Number(r.total_rows ?? 0),
          estimatedBytes: Number(r.estimated_bytes ?? 0),
        }));
      }
    } catch (e) {
      console.warn("[db-cleanup] 30day rpc threw", e);
    }
    // Fallback hvis db_bytes ikke ble satt.
    if (dbBytes === 0) {
      try {
        const { data } = await sb.rpc("get_db_usage_stats");
        if (data) dbBytes = Number(data.db_bytes ?? 0);
      } catch {}
    }

    // Per-tabell statistikk: bygg én SQL via UNION ALL gjennom en RPC vi lager.
    // For å unngå ny migrasjon: kjør per-tabell parallelt via REST count().
    const cutoff30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();


    const rows = await Promise.all(
      CANDIDATES.map(async (c): Promise<DbCleanupRow | null> => {
        try {
          // Total bytes + rows fra pg_stat (best-effort via RPC vi allerede har).
          // Vi henter size via en lett RPC: get_table_size som vi inlin'er her.
          // Fallback: bruk count() for rader; bytes settes til 0 hvis ukjent.
          const cutoffRec = c.recommendedDays
            ? new Date(Date.now() - c.recommendedDays * 24 * 3600_000).toISOString()
            : null;

          const [totalQ, oldRecQ, old30Q] = await Promise.all([
            sb.from(c.table).select("*", { count: "exact", head: true }),
            cutoffRec
              ? sb.from(c.table).select("*", { count: "exact", head: true }).lt(c.dateColumn, cutoffRec)
              : Promise.resolve({ count: 0 }),
            sb.from(c.table).select("*", { count: "exact", head: true }).lt(c.dateColumn, cutoff30),
          ]);

          const totalRows = Number(totalQ?.count ?? 0);
          const recRows = Number((oldRecQ as any)?.count ?? 0);
          const m30Rows = Number((old30Q as any)?.count ?? 0);

          // Hent total bytes via pg_total_relation_size.
          let totalBytes = 0;
          try {
            const { data: sz } = await sb.rpc("get_table_bytes", { _table: c.table });
            totalBytes = Number(sz ?? 0);
          } catch {}

          const bytesPerRow = totalRows > 0 ? totalBytes / totalRows : 0;
          const unusedRows = c.unused ? totalRows : 0;
          const unusedBytes = c.unused ? totalBytes : 0;
          const recommendedRows = c.unused ? totalRows : recRows;
          const recommendedBytes = c.unused ? totalBytes : Math.round(recRows * bytesPerRow);
          const month30Bytes = Math.round(m30Rows * bytesPerRow);

          return {
            table: c.table,
            dateColumn: c.dateColumn,
            totalBytes,
            totalRows,
            unusedRows,
            unusedBytes,
            recommendedRows,
            recommendedBytes,
            recommendedDays: c.recommendedDays ?? null,
            month30Rows: m30Rows,
            month30Bytes,
            unused: !!c.unused,
            note: c.note,
          };
        } catch (e) {
          console.warn("[db-cleanup] failed for", c.table, e);
          return null;
        }
      }),
    );

    const filtered = rows.filter((r): r is DbCleanupRow => r !== null);

    // pg_net cache size
    let pgnetBytes = 0;
    let pgnetRows = 0;
    try {
      const { data } = await sb.rpc("get_pgnet_cache_size");
      if (data) {
        pgnetBytes = Number(data.bytes ?? 0);
        pgnetRows = Number(data.rows ?? 0);
      }
    } catch (e) {
      console.warn("[db-cleanup] pgnet size rpc failed", e);
    }

    const totals = filtered.reduce(
      (acc, r) => {
        acc.unusedBytes += r.unusedBytes;
        acc.recommendedBytes += r.recommendedBytes;
        acc.month30Bytes += r.month30Bytes;
        return acc;
      },
      { unusedBytes: 0, recommendedBytes: 0, month30Bytes: 0, full30Bytes, pgnetBytes, pgnetRows, dbBytes },
    );

    return { rows: filtered, totals, full30Rows };

  },
);

export const runDbCleanup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const data = d as { mode: "unused" | "recommended" | "month30" | "full30" | "pgnet" };
    if (!["unused", "recommended", "month30", "full30", "pgnet"].includes(data?.mode)) {
      throw new Error("Ugyldig modus");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ deletedPerTable: Record<string, number>; totalDeleted: number }> => {
    const sb = supabaseAdmin as any;
    const cutoff30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const deletedPerTable: Record<string, number> = {};
    let total = 0;

    // pg_net responscache — TRUNCATE + frigjør disk via SQL-funksjon.
    if (data.mode === "pgnet") {
      try {
        const { data: res, error } = await sb.rpc("cleanup_pgnet_cache");
        if (error) throw new Error(error.message);
        const deleted = Number(res?.deleted_rows ?? 0);
        deletedPerTable["net._http_response"] = deleted;
        return { deletedPerTable, totalDeleted: deleted };
      } catch (e: any) {
        throw new Error("pg_net opprydning feilet: " + (e?.message ?? "ukjent"));
      }
    }

    // Bredt 30-dagers modus: kjør SQL-funksjonen som dekker alle tabeller.
    if (data.mode === "full30") {
      try {
        const { data: res, error } = await sb.rpc("run_db_30day_cleanup");
        if (error) throw new Error(error.message);
        const rows = (res?.rows ?? []) as Array<{ table: string; deleted: number }>;
        for (const r of rows) deletedPerTable[r.table] = Number(r.deleted ?? 0);
        return { deletedPerTable, totalDeleted: Number(res?.total_deleted ?? 0) };
      } catch (e: any) {
        throw new Error("Full 30-dagers opprydning feilet: " + (e?.message ?? "ukjent"));
      }
    }

    for (const c of CANDIDATES) {
      try {
        let q = sb.from(c.table).delete({ count: "exact" });
        if (data.mode === "unused") {
          if (!c.unused) continue;
          q = q.not(c.dateColumn, "is", null);
        } else if (data.mode === "recommended") {
          if (c.unused) {
            q = q.not(c.dateColumn, "is", null);
          } else if (c.recommendedDays) {
            const cutoff = new Date(Date.now() - c.recommendedDays * 24 * 3600_000).toISOString();
            q = q.lt(c.dateColumn, cutoff);
          } else continue;
        } else {
          // month30
          if (c.unused) {
            q = q.not(c.dateColumn, "is", null);
          } else {
            q = q.lt(c.dateColumn, cutoff30);
          }
        }
        const { count, error } = await q;
        if (error) {
          console.warn("[db-cleanup] delete failed", c.table, error.message);
          continue;
        }
        deletedPerTable[c.table] = count ?? 0;
        total += count ?? 0;
      } catch (e) {
        console.warn("[db-cleanup] delete threw", c.table, e);
      }
    }
    return { deletedPerTable, totalDeleted: total };
  });

/**
 * Kjører VACUUM FULL på alle store public-tabeller for å frigjøre faktisk
 * diskplass etter DELETE. VACUUM FULL kan ikke kjøres inne i en funksjon,
 * så vi planlegger den via pg_cron (kjører innen 1 minutt).
 */
export const reclaimDbSpace = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ scheduledCount: number; scheduled: string[]; message: string }> => {
    const sb = supabaseAdmin as any;
    const { data, error } = await sb.rpc("reclaim_space");
    if (error) throw new Error(error.message);
    return {
      scheduledCount: Number(data?.scheduled_count ?? 0),
      scheduled: (data?.scheduled ?? []) as string[],
      message: String(data?.message ?? ""),
    };
  },
);

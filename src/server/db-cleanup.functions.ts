// Estimerer hvor mye plass man sparer i databasen ved ulike opprydningsstrategier.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    dbBytes: number;
  };
};

export const getDbCleanupEstimate = createServerFn({ method: "GET" }).handler(
  async (): Promise<DbCleanupEstimate> => {
    const sb = supabaseAdmin as any;

    // Hent total DB-størrelse (gjenbruk eksisterende RPC).
    let dbBytes = 0;
    try {
      const { data } = await sb.rpc("get_db_usage_stats");
      if (data) dbBytes = Number(data.db_bytes ?? 0);
    } catch {}

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

    const totals = filtered.reduce(
      (acc, r) => {
        acc.unusedBytes += r.unusedBytes;
        acc.recommendedBytes += r.recommendedBytes;
        acc.month30Bytes += r.month30Bytes;
        return acc;
      },
      { unusedBytes: 0, recommendedBytes: 0, month30Bytes: 0, dbBytes },
    );

    return { rows: filtered, totals };
  },
);

export const runDbCleanup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const data = d as { mode: "unused" | "recommended" | "month30" };
    if (!["unused", "recommended", "month30"].includes(data?.mode)) {
      throw new Error("Ugyldig modus");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ deletedPerTable: Record<string, number>; totalDeleted: number }> => {
    const sb = supabaseAdmin as any;
    const cutoff30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const deletedPerTable: Record<string, number> = {};
    let total = 0;

    for (const c of CANDIDATES) {
      try {
        let q = sb.from(c.table).delete({ count: "exact" });
        if (data.mode === "unused") {
          if (!c.unused) continue;
          // slett alt
          q = q.not(c.dateColumn, "is", null);
        } else if (data.mode === "recommended") {
          if (c.unused) {
            q = q.not(c.dateColumn, "is", null);
          } else if (c.recommendedDays) {
            const cutoff = new Date(Date.now() - c.recommendedDays * 24 * 3600_000).toISOString();
            q = q.lt(c.dateColumn, cutoff);
          } else continue;
        } else {
          // month30 — alt eldre enn 30 dager, inkl. unused-tabeller (alt).
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

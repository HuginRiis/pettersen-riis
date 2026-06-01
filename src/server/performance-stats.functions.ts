// Aggregert ytelse-snapshot: DB-bruk, cron-jobber, API-volum, push, pg_net-cache,
// og enkle heuristikker for flaskehalser. Brukes av /ytelse-siden.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PerfCronJob = {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_success: string | null;
  runs_24h: number;
  failed_24h: number;
};

export type PerfTable = {
  table: string;
  bytes: number;
  rows: number;
};

export type PerfApiSource = {
  source: string;
  endpoint: string;
  total_24h: number;
  errors_24h: number;
  cron_24h: number;
  ondemand_24h: number;
  cache_24h: number;
  live_24h: number;
  avg_duration_ms_24h: number | null;
  last_called_at: string | null;
  last_ok: boolean | null;
};

export type PerfHourBucket = {
  hour: string;
  source: string;
  total: number;
  errors: number;
};

export type PerfPushRow = {
  recipient: string;
  today: number;
  week: number;
  month: number;
  total: number;
};

export type PerfBottleneck = {
  level: "info" | "warn" | "critical";
  area: string;
  title: string;
  detail: string;
};

export type PerfRuntime = {
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  cpuSampleMs: number;
  cpuPercent: number;
  uptimeSec: number;
  nodeVersion: string;
  platform: string;
};

export type PerfSnapshot = {
  fetchedAt: string;
  db: {
    bytes: number;
    limitBytes: number;
    tables: PerfTable[];
  };
  cronJobs: PerfCronJob[];
  api: {
    rows: PerfApiSource[];
    hourly: PerfHourBucket[];
    total24h: number;
    errors24h: number;
    avgPerHour: number;
    peakHourTotal: number;
  };
  pgnet: { bytes: number; rows: number };
  push: PerfPushRow[];
  runtime: PerfRuntime;
  bottlenecks: PerfBottleneck[];
};

export const getPerformanceSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<PerfSnapshot> => {
    const sb = supabaseAdmin as any;

    // Runtime sample: measure CPU over ~80 ms window
    const cpuStart = (typeof process !== "undefined" && (process as any).cpuUsage) ? process.cpuUsage() : null;
    const tStart = Date.now();

    const [dbRes, hourlyRes, summaryRes, pgnetRes] = await Promise.allSettled([
      sb.rpc("get_db_usage_stats"),
      sb.rpc("get_api_call_hourly_24h"),
      sb.rpc("get_api_call_summary_24h"),
      sb.rpc("get_pgnet_cache_size"),
    ]);

    // DB
    let dbBytes = 0;
    let tables: PerfTable[] = [];
    let cronJobs: PerfCronJob[] = [];
    if (dbRes.status === "fulfilled" && dbRes.value.data) {
      const d = dbRes.value.data as any;
      dbBytes = Number(d.db_bytes ?? 0);
      tables = (d.tables ?? []).map((t: any) => ({
        table: String(t.table),
        bytes: Number(t.bytes ?? 0),
        rows: Number(t.rows ?? 0),
      }));
      cronJobs = (d.cron_jobs ?? []).map((c: any) => ({
        jobname: String(c.jobname),
        schedule: String(c.schedule),
        active: !!c.active,
        last_run: c.last_run ?? null,
        last_success: c.last_success ?? null,
        runs_24h: Number(c.runs_24h ?? 0),
        failed_24h: Number(c.failed_24h ?? 0),
      }));
    }

    // API timesvis
    let hourly: PerfHourBucket[] = [];
    if (hourlyRes.status === "fulfilled" && hourlyRes.value.data) {
      const d = hourlyRes.value.data as any;
      hourly = (d.hourly ?? []).map((h: any) => ({
        hour: String(h.hour),
        source: String(h.source ?? ""),
        total: Number(h.total ?? 0),
        errors: Number(h.errors ?? 0),
      }));
    }

    // API sammendrag
    let apiRows: PerfApiSource[] = [];
    if (summaryRes.status === "fulfilled" && summaryRes.value.data) {
      const d = summaryRes.value.data as any;
      apiRows = (d.rows ?? []).map((r: any) => ({
        source: String(r.source),
        endpoint: String(r.endpoint),
        total_24h: Number(r.total_24h ?? 0),
        errors_24h: Number(r.errors_24h ?? 0),
        cron_24h: Number(r.cron_24h ?? 0),
        ondemand_24h: Number(r.ondemand_24h ?? 0),
        cache_24h: Number(r.cache_24h ?? 0),
        live_24h: Number(r.live_24h ?? 0),
        avg_duration_ms_24h: r.avg_duration_ms_24h == null ? null : Number(r.avg_duration_ms_24h),
        last_called_at: r.last_called_at ?? null,
        last_ok: r.last_ok ?? null,
      }));
    }

    // pg_net cache
    let pgnet = { bytes: 0, rows: 0 };
    if (pgnetRes.status === "fulfilled" && pgnetRes.value.data) {
      const d = pgnetRes.value.data as any;
      pgnet = { bytes: Number(d.bytes ?? 0), rows: Number(d.rows ?? 0) };
    }

    // Push
    let push: PerfPushRow[] = [];
    try {
      const now = new Date();
      const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const weekAgo = new Date(now.getTime() - 7 * 86400_000);
      const monthAgo = new Date(now.getTime() - 30 * 86400_000);
      const { data } = await sb
        .from("push_send_log")
        .select("recipient, sent_at")
        .eq("ok", true)
        .gte("sent_at", monthAgo.toISOString())
        .limit(50000);
      const map = new Map<string, PerfPushRow>();
      for (const r of (data ?? []) as Array<{ recipient: string; sent_at: string }>) {
        const recipient = r.recipient || "Alle";
        let row = map.get(recipient);
        if (!row) { row = { recipient, today: 0, week: 0, month: 0, total: 0 }; map.set(recipient, row); }
        const t = new Date(r.sent_at);
        row.total += 1; row.month += 1;
        if (t >= weekAgo) row.week += 1;
        if (t >= startToday) row.today += 1;
      }
      push = Array.from(map.values()).sort((a, b) => b.month - a.month);
    } catch (e) {
      console.warn("[perf] push count failed", e);
    }

    // Aggregat
    const total24h = apiRows.reduce((s, r) => s + r.total_24h, 0);
    const errors24h = apiRows.reduce((s, r) => s + r.errors_24h, 0);

    const hourMap = new Map<string, number>();
    for (const b of hourly) {
      hourMap.set(b.hour, (hourMap.get(b.hour) ?? 0) + b.total);
    }
    const hourTotals = Array.from(hourMap.values());
    const avgPerHour = hourTotals.length ? hourTotals.reduce((s, n) => s + n, 0) / hourTotals.length : 0;
    const peakHourTotal = hourTotals.length ? Math.max(...hourTotals) : 0;

    // Heuristikker / flaskehalser
    const bottlenecks: PerfBottleneck[] = [];

    const limitBytes = 500 * 1024 * 1024;
    if (dbBytes / limitBytes > 0.85) {
      bottlenecks.push({
        level: "critical",
        area: "Database",
        title: "Databasen nærmer seg gratis-grensen",
        detail: `Bruker ${prettyBytes(dbBytes)} av ${prettyBytes(limitBytes)} (${Math.round((dbBytes / limitBytes) * 100)}%). Kjør 30-dagers opprydding eller arkiver gamle logger.`,
      });
    } else if (dbBytes / limitBytes > 0.6) {
      bottlenecks.push({
        level: "warn",
        area: "Database",
        title: "Databasen vokser",
        detail: `Bruker ${prettyBytes(dbBytes)} (${Math.round((dbBytes / limitBytes) * 100)}% av 500 MB).`,
      });
    }

    if (pgnet.rows > 50000) {
      bottlenecks.push({
        level: "warn",
        area: "pg_net cache",
        title: "pg_net-responsbuffer er stor",
        detail: `${pgnet.rows.toLocaleString("nb-NO")} rader (${prettyBytes(pgnet.bytes)}). Kjør "Tøm pg_net cache" fra Vakttårnet.`,
      });
    }

    const heavyTables = tables.filter((t) => t.bytes > 25 * 1024 * 1024).slice(0, 3);
    for (const t of heavyTables) {
      bottlenecks.push({
        level: t.bytes > 75 * 1024 * 1024 ? "warn" : "info",
        area: "Tabell",
        title: `${t.table} bruker ${prettyBytes(t.bytes)}`,
        detail: `${t.rows.toLocaleString("nb-NO")} rader. Vurder retensjon hvis tabellen er en logg.`,
      });
    }

    const failingCron = cronJobs.filter((c) => c.active && c.failed_24h > 0);
    for (const c of failingCron.slice(0, 5)) {
      bottlenecks.push({
        level: c.failed_24h > 5 ? "critical" : "warn",
        area: "Cron",
        title: `${c.jobname}: ${c.failed_24h} feilet siste 24t`,
        detail: `Plan: ${c.schedule}. Siste suksess: ${c.last_success ? new Date(c.last_success).toLocaleString("nb-NO") : "ukjent"}.`,
      });
    }
    const inactiveCron = cronJobs.filter((c) => !c.active);
    if (inactiveCron.length > 0) {
      bottlenecks.push({
        level: "info",
        area: "Cron",
        title: `${inactiveCron.length} cron-jobb${inactiveCron.length === 1 ? "" : "er"} er deaktivert`,
        detail: inactiveCron.slice(0, 6).map((c) => c.jobname).join(", "),
      });
    }

    const heavySources = apiRows
      .reduce<Map<string, { total: number; errors: number }>>((acc, r) => {
        const cur = acc.get(r.source) ?? { total: 0, errors: 0 };
        cur.total += r.total_24h;
        cur.errors += r.errors_24h;
        acc.set(r.source, cur);
        return acc;
      }, new Map());
    const sourceList = Array.from(heavySources.entries()).sort((a, b) => b[1].total - a[1].total);
    const top = sourceList[0];
    if (top && top[1].total > 1000) {
      bottlenecks.push({
        level: top[1].total > 5000 ? "warn" : "info",
        area: "API-volum",
        title: `${top[0]} står for ${top[1].total.toLocaleString("nb-NO")} kall siste 24t`,
        detail: "Vurder å øke cache-tid eller pause kilden i Vakttårnet hvis den ikke er nødvendig hele døgnet.",
      });
    }
    for (const [src, v] of sourceList) {
      if (v.errors >= 20 && v.errors / Math.max(1, v.total) > 0.1) {
        bottlenecks.push({
          level: "warn",
          area: "API-feil",
          title: `${src}: ${v.errors} feil av ${v.total} kall`,
          detail: `Feilrate ${Math.round((v.errors / Math.max(1, v.total)) * 100)}%. Sjekk API-loggen for detaljer.`,
        });
      }
    }

    const slowEndpoints = apiRows
      .filter((r) => (r.avg_duration_ms_24h ?? 0) > 2000 && r.total_24h >= 5)
      .sort((a, b) => (b.avg_duration_ms_24h ?? 0) - (a.avg_duration_ms_24h ?? 0))
      .slice(0, 3);
    for (const r of slowEndpoints) {
      bottlenecks.push({
        level: (r.avg_duration_ms_24h ?? 0) > 5000 ? "warn" : "info",
        area: "Treghet",
        title: `${r.source} / ${r.endpoint}: ${Math.round(r.avg_duration_ms_24h ?? 0)} ms snitt`,
        detail: `${r.total_24h} kall siste 24t. Vurder cache eller bakgrunnsoppdatering.`,
      });
    }

    if (peakHourTotal > avgPerHour * 3 && peakHourTotal > 200) {
      bottlenecks.push({
        level: "info",
        area: "Trafikkmønster",
        title: "Stor variasjon time-for-time",
        detail: `Snitt ${Math.round(avgPerHour)} kall/t, topp ${peakHourTotal}. Spre cron-jobber utover hvis mulig.`,
      });
    }

    if (bottlenecks.length === 0) {
      bottlenecks.push({
        level: "info",
        area: "Generelt",
        title: "Ingen åpenbare flaskehalser",
        detail: "API-volum, feilrater, databasebruk og cron-jobber ser sunne ut.",
      });
    }

    // Runtime: worker-prosess minne + CPU samplet over kort vindu
    let runtime: PerfRuntime = {
      heapUsedBytes: 0, heapTotalBytes: 0, rssBytes: 0, externalBytes: 0, arrayBuffersBytes: 0,
      cpuUserMs: 0, cpuSystemMs: 0, cpuSampleMs: 0, cpuPercent: 0,
      uptimeSec: 0, nodeVersion: "", platform: "",
    };
    try {
      const mem = (typeof process !== "undefined" && process.memoryUsage) ? process.memoryUsage() : null;
      const cpuEnd = (cpuStart && (process as any).cpuUsage) ? process.cpuUsage(cpuStart) : null;
      const sampleMs = Math.max(1, Date.now() - tStart);
      const userMs = cpuEnd ? cpuEnd.user / 1000 : 0;
      const sysMs = cpuEnd ? cpuEnd.system / 1000 : 0;
      runtime = {
        heapUsedBytes: Number(mem?.heapUsed ?? 0),
        heapTotalBytes: Number(mem?.heapTotal ?? 0),
        rssBytes: Number(mem?.rss ?? 0),
        externalBytes: Number((mem as any)?.external ?? 0),
        arrayBuffersBytes: Number((mem as any)?.arrayBuffers ?? 0),
        cpuUserMs: Math.round(userMs * 100) / 100,
        cpuSystemMs: Math.round(sysMs * 100) / 100,
        cpuSampleMs: sampleMs,
        cpuPercent: Math.round(((userMs + sysMs) / sampleMs) * 100),
        uptimeSec: typeof process !== "undefined" && process.uptime ? Math.round(process.uptime()) : 0,
        nodeVersion: typeof process !== "undefined" ? (process.version ?? "") : "",
        platform: typeof process !== "undefined" ? (process.platform ?? "") : "",
      };
    } catch (e) {
      console.warn("[perf] runtime sample failed", e);
    }

    if (runtime.heapUsedBytes && runtime.heapTotalBytes && runtime.heapUsedBytes / runtime.heapTotalBytes > 0.9) {
      bottlenecks.push({
        level: "warn",
        area: "Minne",
        title: "Worker-heap nær full",
        detail: `${prettyBytes(runtime.heapUsedBytes)} av ${prettyBytes(runtime.heapTotalBytes)} brukt. Reduser store responser eller cache.`,
      });
    }

    return {
      fetchedAt: new Date().toISOString(),
      db: { bytes: dbBytes, limitBytes, tables },
      cronJobs,
      api: { rows: apiRows, hourly, total24h, errors24h, avgPerHour, peakHourTotal },
      pgnet,
      push,
      runtime,
      bottlenecks,
    };
  },
);

function prettyBytes(b: number): string {
  if (!b) return "0 B";
  const units = ["B", "kB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

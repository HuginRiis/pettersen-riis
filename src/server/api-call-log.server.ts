// Sentral logger for eksterne API-kall som server gjør på vegne av appen.
// Brukes via withApiLog() rundt enhver serverFn.handler() for å skrive
// hver kjøring til public.api_call_log i Supabase.
//
// CRITICAL: importeres BARE fra .server.ts / .ts som ikke ender opp i
// klient-bundlet. Bruker service role.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isApiSourcePaused, ApiSourcePausedError } from "./api-pause.server";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Best-effort: hent path til siden som trigget API-kallet ut fra Referer.
 * Returnerer null hvis vi er utenfor request-context (cron, hooks).
 */
function getTriggerPath(): string | null {
  try {
    const ref = getRequestHeader("referer") || getRequestHeader("referrer");
    if (!ref) return null;
    try {
      return new URL(String(ref)).pathname || "/";
    } catch {
      return String(ref);
    }
  } catch {
    return null;
  }
}

export type ApiSource =
  | "homey"
  | "strava"
  | "netatmo"
  | "tibber"
  | "met"
  | "nrk"
  | "lightning"
  | "garbage"
  | "spot"
  | "kassal"
  | "gardena"
  | "garmin"
  | "roborock"
  | "ai"
  | "posten"
  | "geoip"
  | "uv"
  | "other";

export interface LogEntry {
  source: ApiSource | string;
  endpoint: string;
  ok: boolean;
  duration_ms?: number | null;
  status_code?: number | null;
  error_message?: string | null;
  cached?: boolean;
  metadata?: Record<string, unknown> | null;
}

/**
 * Skriv én logg-rad til DB. Svelger feil — vi vil aldri velte en
 * server-funksjon på grunn av loggingen.
 */
export async function recordApiCall(entry: LogEntry): Promise<void> {
  try {
    await (supabaseAdmin.from("api_call_log") as any).insert({
      source: entry.source,
      endpoint: entry.endpoint,
      ok: entry.ok,
      duration_ms: entry.duration_ms ?? null,
      status_code: entry.status_code ?? null,
      error_message: entry.error_message ?? null,
      cached: entry.cached ?? false,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    // ikke kritisk
    console.warn("[api-call-log] insert failed", err);
  }
}

/**
 * Wrap en async-handler slik at hver kjøring logges til DB.
 * Returnerer en ny funksjon med samme signatur.
 *
 * Bruk:
 *   const realHandler = withApiLog("homey", "getOutdoorLightsStatus",
 *     async () => { ... }
 *   );
 */
export function withApiLog<T extends (...args: any[]) => Promise<any>>(
  source: ApiSource | string,
  endpoint: string,
  fn: T,
): T {
  return (async (...args: Parameters<T>) => {
    if (await isApiSourcePaused(String(source))) {
      // Ikke logg pausede forsøk — vi vil at "Sist kalt" skal vise siste
      // ekte API-kall, ikke at noe forsøkte mens kilden var pauset.
      throw new ApiSourcePausedError(String(source));
    }
    const started = Date.now();
    const path = getTriggerPath();
    try {
      const result = await fn(...args);
      const cached =
        result && typeof result === "object" && "cached" in result
          ? Boolean((result as { cached?: unknown }).cached)
          : false;
      await recordApiCall({
        source,
        endpoint,
        ok: true,
        duration_ms: Date.now() - started,
        cached,
        metadata: path ? { path } : null,
      });
      return result;
    } catch (err) {
      await recordApiCall({
        source,
        endpoint,
        ok: false,
        duration_ms: Date.now() - started,
        error_message: err instanceof Error ? err.message : String(err),
        metadata: path ? { path } : null,
      });
      throw err;
    }
  }) as T;
}

/**
 * Wrap fetch() med automatisk API-call-logging. Returnerer Response og logger
 * ok = res.ok, status_code og varighet.
 */
export async function loggedFetch(
  source: ApiSource | string,
  endpoint: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (await isApiSourcePaused(String(source))) {
    // Ikke logg pausede forsøk i api_call_log.
    throw new ApiSourcePausedError(String(source));
  }
  const started = Date.now();
  const path = getTriggerPath();
  try {
    const res = await fetch(url, init);
    await recordApiCall({
      source,
      endpoint,
      ok: res.ok,
      duration_ms: Date.now() - started,
      status_code: res.status,
      metadata: path ? { path } : null,
    });
    return res;
  } catch (err) {
    await recordApiCall({
      source,
      endpoint,
      ok: false,
      duration_ms: Date.now() - started,
      error_message: err instanceof Error ? err.message : String(err),
      metadata: path ? { path } : null,
    });
    throw err;
  }
}

export type ApiCallSummaryRow = {
  source: string;
  endpoint: string;
  last_called_at: string | null;
  last_ok: boolean | null;
  last_duration_ms: number | null;
  last_error: string | null;
  last_cached: boolean;
  total_24h: number;
  errors_24h: number;
  ondemand_24h: number;
  cron_24h: number;
  auth_24h: number;
  live_24h: number;
  cache_24h: number;
  avg_duration_ms_24h: number | null;
};


export type SourceSchedule = {
  /** Lesbar beskrivelse, f.eks. "hvert minutt", "hver 5 min", "ved bruk" */
  description: string;
  /** Forventet intervall i ms mellom synkroniseringer; null = on-demand */
  intervalMs: number | null;
  /** Hvordan kilden trigges */
  trigger: "cron" | "cache" | "on-demand" | "webhook";
};

/**
 * Kjente sync-tidsplaner per kilde. Brukes til å estimere "neste sync".
 * - cron: jobber satt opp via pg_cron mot serverhooks
 * - cache: server-cache med TTL — neste server-kall vil refetche etter TTL
 * - on-demand: trigges når en side lastes; ikke noe fast intervall
 */
export const SOURCE_SCHEDULES: Record<string, SourceSchedule> = {
  homey: { description: "hvert minutt (poll + snapshot + agenda)", intervalMs: 60_000, trigger: "cron" },
  strava: { description: "hver 30. min 06:30–21:00", intervalMs: 30 * 60_000, trigger: "cron" },
  netatmo: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  tibber: { description: "hvert minutt (push) + hver time (backfill)", intervalMs: 60_000, trigger: "cron" },
  met: { description: "hvert minutt (weather + met-alert push)", intervalMs: 60_000, trigger: "cron" },
  nrk: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  spot: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  lightning: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  garbage: { description: "cache 6t (poll hvert minutt fra agenda-push)", intervalMs: 6 * 60 * 60 * 1000, trigger: "cache" },
  kassal: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  gardena: { description: "hver 45. min 06:30–21:00", intervalMs: 45 * 60_000, trigger: "cron" },
  garmin: { description: "hvert minutt (egen tidsplan per bruker)", intervalMs: 60_000, trigger: "cron" },
  roborock: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  ai: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  posten: { description: "hvert minutt (mail-delivery-push)", intervalMs: 60_000, trigger: "cron" },
  geoip: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  uv: { description: "hvert minutt (uv-push)", intervalMs: 60_000, trigger: "cron" },
  other: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
};

export type ApiCallSummary = {
  fetchedAt: number;
  rows: ApiCallSummaryRow[];
  /** Per kilde: ISO-tidspunkt for neste forventede sync, eller null. */
  nextRunBySource: Record<string, string | null>;
  /** Per kilde: sync-plan (lesbar beskrivelse + trigger). */
  schedules: Record<string, SourceSchedule>;
  recent: Array<{
    id: string;
    source: string;
    endpoint: string;
    ok: boolean;
    duration_ms: number | null;
    error_message: string | null;
    cached: boolean;
    called_at: string;
  }>;
  /** Per time siste 24t, per kilde, antall kall. */
  hourly: Array<{ hour: string; source: string; total: number; errors: number }>;
  /** Per kilde: hvilke sider som har trigget kallene siste 24t. */
  pagesBySource: Record<string, Array<{ page: string; total: number; last_at: string }>>;
  /** Gårsdagens totale kall per time (samme time-buckets som `hourly`). */
  yesterday: Array<{ hour: string; yest_total: number }>;
};


export async function computeApiCallSummary(): Promise<ApiCallSummary> {
  // Aggregert i DB for å unngå at høyt-trafikkerte kilder skyver de mindre
  // ut av en limit. Returnerer alle (source, endpoint) siste 24t.
  const { data, error } = await (supabaseAdmin as any).rpc("get_api_call_summary_24h");

  if (error || !data) {
    console.error("[api-call-log] summary rpc failed", error);
    return {
      fetchedAt: Date.now(),
      rows: [],
      nextRunBySource: {},
      schedules: SOURCE_SCHEDULES,
      recent: [],
      hourly: [],
      pagesBySource: {},
      yesterday: [],
    };
  }


  const rawRows = (data.rows ?? []) as Array<{
    source: string;
    endpoint: string;
    total_24h: number;
    errors_24h: number;
    ondemand_24h: number | null;
    cron_24h: number | null;
    auth_24h: number | null;
    live_24h: number | null;
    cache_24h: number | null;
    avg_duration_ms_24h: number | null;
    last_called_at: string | null;
    last_ok: boolean | null;
    last_duration_ms: number | null;
    last_error: string | null;
    last_cached: boolean;
  }>;

  const summary: ApiCallSummaryRow[] = rawRows.map((r) => ({
    source: r.source,
    endpoint: r.endpoint,
    last_called_at: r.last_called_at,
    last_ok: r.last_ok,
    last_duration_ms: r.last_duration_ms,
    last_error: r.last_error,
    last_cached: r.last_cached ?? false,
    total_24h: Number(r.total_24h) || 0,
    errors_24h: Number(r.errors_24h) || 0,
    ondemand_24h: Number(r.ondemand_24h) || 0,
    cron_24h: Number(r.cron_24h) || 0,
    auth_24h: Number(r.auth_24h) || 0,
    live_24h: Number(r.live_24h) || 0,
    cache_24h: Number(r.cache_24h) || 0,
    avg_duration_ms_24h:
      r.avg_duration_ms_24h == null ? null : Number(r.avg_duration_ms_24h),
  }));


  summary.sort((a, b) => {
    const ta = a.last_called_at ? Date.parse(a.last_called_at) : 0;
    const tb = b.last_called_at ? Date.parse(b.last_called_at) : 0;
    return tb - ta;
  });

  const recent = ((data.recent ?? []) as Array<{
    id: string;
    source: string;
    endpoint: string;
    ok: boolean;
    duration_ms: number | null;
    error_message: string | null;
    cached: boolean;
    called_at: string;
  }>).map((r) => ({
    id: r.id,
    source: r.source,
    endpoint: r.endpoint,
    ok: r.ok,
    duration_ms: r.duration_ms,
    error_message: r.error_message,
    cached: r.cached,
    called_at: r.called_at,
  }));


  // Beregn neste forventede sync per kilde basert på siste kall + kjent intervall.
  const lastBySource = new Map<string, number>();
  for (const row of summary) {
    if (!row.last_called_at) continue;
    const ts = Date.parse(row.last_called_at);
    const prev = lastBySource.get(row.source) ?? 0;
    if (ts > prev) lastBySource.set(row.source, ts);
  }
  const nextRunBySource: Record<string, string | null> = {};
  for (const [src, sched] of Object.entries(SOURCE_SCHEDULES)) {
    if (sched.intervalMs == null) {
      nextRunBySource[src] = null;
      continue;
    }
    const last = lastBySource.get(src);
    if (!last) {
      // Aldri kjørt — neste sync er "snart" (vi gir 'now' for cron, ellers null)
      nextRunBySource[src] = sched.trigger === "cron" ? new Date().toISOString() : null;
      continue;
    }
    nextRunBySource[src] = new Date(last + sched.intervalMs).toISOString();
  }
  // Inkluder også kilder vi har sett i loggen, men ikke har eksplisitt schedule for
  for (const src of lastBySource.keys()) {
    if (!(src in nextRunBySource)) nextRunBySource[src] = null;
  }

  // Hent time-for-time + sider per kilde + gårsdagens kall per time (egen RPC).
  let hourly: ApiCallSummary["hourly"] = [];
  let yesterday: ApiCallSummary["yesterday"] = [];
  const pagesBySource: ApiCallSummary["pagesBySource"] = {};
  try {
    const { data: hd } = await (supabaseAdmin as any).rpc("get_api_call_hourly_24h");
    if (hd) {
      hourly = (hd.hourly ?? []) as ApiCallSummary["hourly"];
      yesterday = ((hd.yesterday ?? []) as Array<{ hour: string; yest_total: number | string }>).map((y) => ({
        hour: y.hour,
        yest_total: Number(y.yest_total) || 0,
      }));
      for (const p of (hd.pages ?? []) as Array<{
        source: string; page: string; total: number; last_at: string;
      }>) {
        if (!p.source) continue;
        (pagesBySource[p.source] ??= []).push({
          page: p.page,
          total: Number(p.total) || 0,
          last_at: p.last_at,
        });
      }
    }
  } catch (e) {
    console.warn("[api-call-log] hourly rpc failed", e);
  }

  return {
    fetchedAt: Date.now(),
    rows: summary,
    nextRunBySource,
    schedules: SOURCE_SCHEDULES,
    recent,
    hourly,
    pagesBySource,
    yesterday,
  };
}


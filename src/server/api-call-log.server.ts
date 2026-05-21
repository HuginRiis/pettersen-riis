// Sentral logger for eksterne API-kall som server gjør på vegne av appen.
// Brukes via withApiLog() rundt enhver serverFn.handler() for å skrive
// hver kjøring til public.api_call_log i Supabase.
//
// CRITICAL: importeres BARE fra .server.ts / .ts som ikke ender opp i
// klient-bundlet. Bruker service role.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isApiSourcePaused, ApiSourcePausedError } from "./api-pause.server";

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
    try {
      const result = await fn(...args);
      // forsøk å detektere "cached"-flagg på resultatet
      const cached =
        result && typeof result === "object" && "cached" in result
          ? Boolean((result as { cached?: unknown }).cached)
          : false;
      // VIKTIG: vi må AWAIT inserten i stedet for fire-and-forget,
      // ellers kanselleres den av Cloudflare Worker-runtime når
      // responsen returneres — spesielt for raske/cached handlere
      // (Netatmo, Strava, NRK osv. som returnerer på <50ms ved cache).
      await recordApiCall({
        source,
        endpoint,
        ok: true,
        duration_ms: Date.now() - started,
        cached,
      });
      return result;
    } catch (err) {
      await recordApiCall({
        source,
        endpoint,
        ok: false,
        duration_ms: Date.now() - started,
        error_message: err instanceof Error ? err.message : String(err),
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
    const err = new ApiSourcePausedError(String(source));
    await recordApiCall({
      source,
      endpoint,
      ok: false,
      duration_ms: 0,
      error_message: err.message,
      metadata: { paused: true },
    });
    throw err;
  }
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    await recordApiCall({
      source,
      endpoint,
      ok: res.ok,
      duration_ms: Date.now() - started,
      status_code: res.status,
    });
    return res;
  } catch (err) {
    await recordApiCall({
      source,
      endpoint,
      ok: false,
      duration_ms: Date.now() - started,
      error_message: err instanceof Error ? err.message : String(err),
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
  homey: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  strava: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  netatmo: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  tibber: { description: "hver 15. min (GraphQL HOURLY)", intervalMs: 15 * 60_000, trigger: "cron" },
  met: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  nrk: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  spot: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  lightning: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  garbage: { description: "cache 6t", intervalMs: 6 * 60 * 60 * 1000, trigger: "cache" },
  kassal: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  gardena: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  garmin: { description: "hver time 06–20", intervalMs: 60 * 60_000, trigger: "cron" },
  roborock: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  ai: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  posten: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  geoip: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  uv: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
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
    };
  }

  const rawRows = (data.rows ?? []) as Array<{
    source: string;
    endpoint: string;
    total_24h: number;
    errors_24h: number;
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

  return {
    fetchedAt: Date.now(),
    rows: summary,
    nextRunBySource,
    schedules: SOURCE_SCHEDULES,
    recent,
  };
}

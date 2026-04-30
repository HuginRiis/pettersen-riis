// Sentral logger for eksterne API-kall som server gjør på vegne av appen.
// Brukes via withApiLog() rundt enhver serverFn.handler() for å skrive
// hver kjøring til public.api_call_log i Supabase.
//
// CRITICAL: importeres BARE fra .server.ts / .ts som ikke ender opp i
// klient-bundlet. Bruker service role.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  tibber: { description: "hvert minutt (snapshot)", intervalMs: 60_000, trigger: "cron" },
  met: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  nrk: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  spot: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  lightning: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
  garbage: { description: "cache 6t", intervalMs: 6 * 60 * 60 * 1000, trigger: "cache" },
  kassal: { description: "ved bruk", intervalMs: null, trigger: "on-demand" },
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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Hent alle kall siste 24t (begrens til 5000 for å være trygg).
  const { data: rows, error } = await (supabaseAdmin.from("api_call_log") as any)
    .select("id,source,endpoint,ok,duration_ms,error_message,cached,called_at")
    .gte("called_at", since)
    .order("called_at", { ascending: false })
    .limit(5000) as { data: Array<{ id: string; source: string; endpoint: string; ok: boolean; duration_ms: number | null; error_message: string | null; cached: boolean; called_at: string }> | null; error: any };

  if (error) {
    console.error("[api-call-log] summary query failed", error);
    return {
      fetchedAt: Date.now(),
      rows: [],
      nextRunBySource: {},
      schedules: SOURCE_SCHEDULES,
      recent: [],
    };
  }

  type Row = {
    id: string;
    source: string;
    endpoint: string;
    ok: boolean;
    duration_ms: number | null;
    error_message: string | null;
    cached: boolean;
    called_at: string;
  };

  const buckets = new Map<
    string,
    {
      source: string;
      endpoint: string;
      last: Row | null;
      total: number;
      errors: number;
      durations: number[];
    }
  >();

  for (const r of rows ?? []) {
    const key = `${r.source}::${r.endpoint}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        source: r.source,
        endpoint: r.endpoint,
        last: null,
        total: 0,
        errors: 0,
        durations: [],
      };
      buckets.set(key, b);
    }
    if (!b.last) b.last = r; // første (nyeste pga sortering)
    b.total += 1;
    if (!r.ok) b.errors += 1;
    if (typeof r.duration_ms === "number") b.durations.push(r.duration_ms);
  }

  // For endpoints uten kall siste 24t — hent siste kjente uansett tid.
  // Vi sjekker hvilke endpoints vi vet om fra en kjent liste også, men her
  // holder vi det enkelt og lar tabellen styre.

  const summary: ApiCallSummaryRow[] = Array.from(buckets.values()).map((b) => ({
    source: b.source,
    endpoint: b.endpoint,
    last_called_at: b.last?.called_at ?? null,
    last_ok: b.last?.ok ?? null,
    last_duration_ms: b.last?.duration_ms ?? null,
    last_error: b.last?.error_message ?? null,
    last_cached: b.last?.cached ?? false,
    total_24h: b.total,
    errors_24h: b.errors,
    avg_duration_ms_24h:
      b.durations.length > 0
        ? Math.round(
            b.durations.reduce((s, d) => s + d, 0) / b.durations.length,
          )
        : null,
  }));

  // Sortér: nyeste sist-kall først
  summary.sort((a, b) => {
    const ta = a.last_called_at ? Date.parse(a.last_called_at) : 0;
    const tb = b.last_called_at ? Date.parse(b.last_called_at) : 0;
    return tb - ta;
  });

  const recent = (rows ?? []).slice(0, 50).map((r) => ({
    id: r.id,
    source: r.source,
    endpoint: r.endpoint,
    ok: r.ok,
    duration_ms: r.duration_ms,
    error_message: r.error_message,
    cached: r.cached,
    called_at: r.called_at,
  }));

  return { fetchedAt: Date.now(), rows: summary, recent };
}

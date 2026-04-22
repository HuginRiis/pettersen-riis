import {
  getRequest,
  getRequestHeader,
  useSession,
} from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ── Husets dørvakt — sjekker om besøkende er innlogget. Returnerer
// bare en boolean så vi kan bruke samme funksjon både til logging og
// rate-limiting uten å kaste feil for uinnloggede.
type SessionData = { authenticated?: boolean };
function getSessionConfig() {
  const base = process.env.HOUSE_RIIS_PASSWORD ?? "";
  const derived =
    (base + "::house-riis-session-v1::winter-is-ours").repeat(4).slice(0, 64);
  return {
    password: derived,
    name: "house_riis_session",
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
  };
}

export async function isHouseAuthenticated(): Promise<boolean> {
  try {
    const session = await useSession<SessionData>(getSessionConfig());
    return session.data?.authenticated === true;
  } catch {
    return false;
  }
}

// ── Hent IP fra requesten (samme prioritering som visitors.ts) ────────
export function readClientIp(): string | null {
  try {
    const xff = getRequestHeader("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const cf = getRequestHeader("cf-connecting-ip");
    if (cf) return cf;
    const real = getRequestHeader("x-real-ip");
    if (real) return real;
  } catch {
    /* ignore */
  }
  return null;
}

export function readUserAgent(): string | null {
  try {
    const req = getRequest();
    return req?.headers.get("user-agent") ?? null;
  } catch {
    return null;
  }
}

// ── Approx pricing for Lovable AI Gateway (USD per 1M tokens). Brukes
// kun til en grov estimering i Vakttårnet — eksakte tall ligger på
// fakturaen i workspace-innstillingene.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-3-flash-preview": { input: 0.075, output: 0.3 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
  "google/gemini-2.5-flash-lite": { input: 0.04, output: 0.15 },
  "google/gemini-2.5-pro": { input: 1.25, output: 5.0 },
  "google/gemini-3.1-pro-preview": { input: 1.25, output: 5.0 },
  "openai/gpt-5": { input: 2.5, output: 10.0 },
  "openai/gpt-5-mini": { input: 0.25, output: 1.0 },
  "openai/gpt-5-nano": { input: 0.05, output: 0.2 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): number | null {
  const p = MODEL_PRICING[model];
  if (!p) return null;
  const inTok = promptTokens ?? 0;
  const outTok = completionTokens ?? 0;
  return (inTok * p.input + outTok * p.output) / 1_000_000;
}

// ── Ukentlig kvote for uinnloggede besøkende. Rullerende 7-dagers
// vindu, 5 vellykkede søk per IP per feature. Innloggede passerer alltid.
export const PUBLIC_WEEKLY_LIMIT = 5;

export async function getWeeklyQuotaForIp(
  ip: string | null,
  feature: string,
): Promise<{
  used: number;
  limit: number;
  remaining: number;
  resetAt: string | null;
  windowStart: string;
}> {
  const limit = PUBLIC_WEEKLY_LIMIT;
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const empty = {
    used: 0,
    limit,
    remaining: limit,
    resetAt: null as string | null,
    windowStart: windowStart.toISOString(),
  };
  if (!ip) return empty;
  const { data, error } = await supabaseAdmin
    .from("ai_search_log")
    .select("created_at")
    .eq("ip", ip)
    .eq("authenticated", false)
    .eq("status", "ok")
    .eq("feature", feature)
    .gte("created_at", windowStart.toISOString())
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("getWeeklyQuotaForIp lookup failed:", error.message);
    return empty;
  }
  const used = data?.length ?? 0;
  // Når kvoten er brukt opp ruller den eldste loggen ut etter 7 dager.
  const oldest = data?.[0]?.created_at ?? null;
  const resetAt = oldest
    ? new Date(new Date(oldest).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt,
    windowStart: windowStart.toISOString(),
  };
}

// Bakoverkompatibel innpakning brukt av eksisterende kall.
export async function canUseAiToday(ip: string | null): Promise<{
  allowed: boolean;
  resetAt: string | null;
}> {
  const q = await getWeeklyQuotaForIp(ip, "turer");
  return { allowed: q.remaining > 0, resetAt: q.resetAt };
}

// ── Siste vellykkede søk fra denne IP-en (brukes til å vise historikk
// for innloggede). Returnerer maks 10.
export type RecentSearchRow = {
  feature: string;
  query: string | null;
  created_at: string;
  status: string;
};

export async function getRecentSearchesForIp(
  ip: string | null,
  limit = 10,
): Promise<RecentSearchRow[]> {
  if (!ip) return [];
  const { data, error } = await supabaseAdmin
    .from("ai_search_log")
    .select("feature, query, created_at, status")
    .eq("ip", ip)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("getRecentSearchesForIp failed:", error.message);
    return [];
  }
  return (data ?? []) as RecentSearchRow[];
}

// Siste gang denne IP-en var innom (uansett feature/status).
export async function getLastVisitForIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const { data, error } = await supabaseAdmin
    .from("ai_search_log")
    .select("created_at")
    .eq("ip", ip)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { created_at: string }).created_at;
}

// ── Logg ett AI-søk. Skriver direkte med admin-klienten så det også
// fungerer for uinnloggede besøkende.
export type LogAiSearchInput = {
  feature: string;
  query: string | null;
  model: string;
  authenticated: boolean;
  status: "ok" | "rate_limited" | "error" | "denied";
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
};

export async function logAiSearch(input: LogAiSearchInput): Promise<void> {
  try {
    const ip = readClientIp();
    const ua = readUserAgent();
    const cost = estimateCostUsd(
      input.model,
      input.promptTokens,
      input.completionTokens,
    );
    await supabaseAdmin.from("ai_search_log").insert({
      feature: input.feature,
      query: input.query?.slice(0, 500) ?? null,
      model: input.model,
      authenticated: input.authenticated,
      status: input.status,
      ip,
      user_agent: ua?.slice(0, 500) ?? null,
      prompt_tokens: input.promptTokens ?? null,
      completion_tokens: input.completionTokens ?? null,
      total_tokens:
        input.totalTokens ??
        (input.promptTokens != null && input.completionTokens != null
          ? input.promptTokens + input.completionTokens
          : null),
      estimated_cost_usd: cost,
    });
  } catch (e) {
    console.warn("logAiSearch failed:", e);
  }
}

// ── Vakttårnet — statistikk over AI-bruk ──────────────────────────────
export type AiUsageRow = {
  id: string;
  feature: string;
  query: string | null;
  model: string | null;
  authenticated: boolean;
  status: string;
  ip: string | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
};

export type AiUsageStats = {
  totalSearches: number;
  searchesToday: number;
  searchesMonth: number;
  authenticatedSearches: number;
  publicSearches: number;
  rateLimited: number;
  totalTokens: number;
  estimatedCostUsd: number;
  costToday: number;
  costMonth: number;
  byFeature: Array<{ feature: string; count: number; costUsd: number }>;
  byModel: Array<{ model: string; count: number; costUsd: number }>;
  topQueries: Array<{ query: string; count: number }>;
  recent: AiUsageRow[];
  perDay: Array<{ date: string; count: number; costUsd: number }>;
};

export async function computeAiUsageStats(): Promise<AiUsageStats> {
  {
    const { data, error } = await supabaseAdmin
      .from("ai_search_log")
      .select(
        "id, feature, query, model, authenticated, status, ip, total_tokens, estimated_cost_usd, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("getAiUsageStats failed:", error);
      return {
        totalSearches: 0,
        searchesToday: 0,
        searchesMonth: 0,
        authenticatedSearches: 0,
        publicSearches: 0,
        rateLimited: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        costToday: 0,
        costMonth: 0,
        byFeature: [],
        byModel: [],
        topQueries: [],
        recent: [],
        perDay: [],
      };
    }

    const rows = (data ?? []) as AiUsageRow[];
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    let totalTokens = 0;
    let estimatedCostUsd = 0;
    let costToday = 0;
    let costMonth = 0;
    let searchesToday = 0;
    let searchesMonth = 0;
    let authenticatedSearches = 0;
    let publicSearches = 0;
    let rateLimited = 0;
    const featureMap = new Map<string, { count: number; costUsd: number }>();
    const modelMap = new Map<string, { count: number; costUsd: number }>();
    const queryMap = new Map<string, number>();
    const dayMap = new Map<string, { count: number; costUsd: number }>();

    for (const r of rows) {
      const created = new Date(r.created_at);
      const cost = Number(r.estimated_cost_usd ?? 0) || 0;
      const tokens = Number(r.total_tokens ?? 0) || 0;
      totalTokens += tokens;
      estimatedCostUsd += cost;
      if (created >= startOfDay) {
        searchesToday += 1;
        costToday += cost;
      }
      if (created >= startOfMonth) {
        searchesMonth += 1;
        costMonth += cost;
      }
      if (r.authenticated) authenticatedSearches += 1;
      else publicSearches += 1;
      if (r.status === "rate_limited") rateLimited += 1;

      const fKey = r.feature || "ukjent";
      const f = featureMap.get(fKey) ?? { count: 0, costUsd: 0 };
      f.count += 1;
      f.costUsd += cost;
      featureMap.set(fKey, f);

      const mKey = r.model || "ukjent";
      const m = modelMap.get(mKey) ?? { count: 0, costUsd: 0 };
      m.count += 1;
      m.costUsd += cost;
      modelMap.set(mKey, m);

      if (r.query) {
        const q = r.query.trim().toLowerCase();
        if (q) queryMap.set(q, (queryMap.get(q) ?? 0) + 1);
      }

      const dKey = created.toISOString().slice(0, 10);
      const d = dayMap.get(dKey) ?? { count: 0, costUsd: 0 };
      d.count += 1;
      d.costUsd += cost;
      dayMap.set(dKey, d);
    }

    const byFeature = Array.from(featureMap, ([feature, v]) => ({
      feature,
      ...v,
    })).sort((a, b) => b.count - a.count);
    const byModel = Array.from(modelMap, ([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.count - a.count);
    const topQueries = Array.from(queryMap, ([query, count]) => ({
      query,
      count,
    }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const perDay = Array.from(dayMap, ([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    return {
      totalSearches: rows.length,
      searchesToday,
      searchesMonth,
      authenticatedSearches,
      publicSearches,
      rateLimited,
      totalTokens,
      estimatedCostUsd,
      costToday,
      costMonth,
      byFeature,
      byModel,
      topQueries,
      recent: rows.slice(0, 25),
      perDay,
    };
  }
}

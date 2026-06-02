import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();

export const logPageLoad = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      route: z.string().min(1).max(200),
      who: z.string().min(1).max(60).default("anon"),
      device: z.string().max(60).optional().nullable(),
      os: z.string().max(60).optional().nullable(),
      browser: z.string().max(60).optional().nullable(),
      user_agent: z.string().max(500).optional().nullable(),
      load_ms: z.number().int().min(0).max(120_000),
      ttfb_ms: z.number().int().min(0).max(120_000).optional().nullable(),
      dom_ms: z.number().int().min(0).max(120_000).optional().nullable(),
      kind: z.enum(["hard", "spa"]).default("spa"),
    }).parse,
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { error } = await supabaseAdmin.from("page_load_log").insert({
      route: data.route,
      who: data.who,
      device: data.device ?? null,
      os: data.os ?? null,
      browser: data.browser ?? null,
      user_agent: data.user_agent ?? null,
      load_ms: data.load_ms,
      ttfb_ms: data.ttfb_ms ?? null,
      dom_ms: data.dom_ms ?? null,
      kind: data.kind,
    });
    if (error) {
      console.warn("[page-load] insert failed", error.message);
      return { ok: false };
    }
    return { ok: true };
  });

export type PageRouteStat = {
  route: string;
  count: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  last_at: string;
  last_who: string;
  last_device: string | null;
  last_ms: number;
};

export type PageLoadEntry = {
  loaded_at: string;
  route: string;
  who: string;
  device: string | null;
  os: string | null;
  load_ms: number;
  kind: string;
};

export type PageDeviceStat = {
  device: string;
  count: number;
  avg_ms: number;
};

export type PageDailyPoint = {
  day: string;
  avg_ms: number;
  count: number;
};

export type PageUserStat = {
  who: string;
  count: number;
  avg_ms: number;
  last_at: string;
  routes: { route: string; count: number; last_at: string }[];
};

export type SlowPageInsight = {
  route: string;
  avg_ms: number;
  p95_ms: number;
  count: number;
  recent_avg_ms: number;
  prev_avg_ms: number;
  trend: "up" | "down" | "flat";
  trend_pct: number;
  recommendation: string;
};

export type PageLoadStats = {
  routes: PageRouteStat[];
  devices: PageDeviceStat[];
  recent: PageLoadEntry[];
  daily: PageDailyPoint[];
  users: PageUserStat[];
  slowest: SlowPageInsight[];
  totalCount: number;
  avgMs: number;
  sampleLimit: number;
};


function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export const getPageLoadStats = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      days: z.number().int().min(1).max(90).default(14),
      limit: z.number().int().min(100).max(100000).default(10000),
    }).parse,
  )
  .handler(async ({ data }): Promise<PageLoadStats> => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    // PostgREST/Supabase capper enkeltkall til ~1000 rader, så vi paginerer
    // med .range() i bolker for å faktisk hente opp til data.limit rader.
    const PAGE = 1000;
    const all: PageLoadEntry[] = [];
    let lastErr: { message?: string } | null = null;
    for (let from = 0; from < data.limit; from += PAGE) {
      const to = Math.min(data.limit - 1, from + PAGE - 1);
      const { data: rows, error } = await supabaseAdmin
        .from("page_load_log")
        .select("loaded_at, route, who, device, os, load_ms, kind")
        .gte("loaded_at", since)
        .order("loaded_at", { ascending: false })
        .range(from, to);
      if (error) { lastErr = error; break; }
      const batch = (rows ?? []) as PageLoadEntry[];
      all.push(...batch);
      if (batch.length < to - from + 1) break;
    }
    if (lastErr && all.length === 0) {
      console.warn("[page-load] select failed", lastErr.message);
      return { routes: [], devices: [], recent: [], daily: [], users: [], slowest: [], totalCount: 0, avgMs: 0, sampleLimit: data.limit };
    }


    // routes
    const byRoute = new Map<string, PageLoadEntry[]>();
    for (const r of all) {
      const arr = byRoute.get(r.route) ?? [];
      arr.push(r);
      byRoute.set(r.route, arr);
    }
    const routes: PageRouteStat[] = [];
    for (const [route, list] of byRoute) {
      const times = list.map((r) => r.load_ms).sort((a, b) => a - b);
      const sum = times.reduce((a, b) => a + b, 0);
      const last = list[0];
      routes.push({
        route,
        count: list.length,
        avg_ms: Math.round(sum / list.length),
        p50_ms: percentile(times, 50),
        p95_ms: percentile(times, 95),
        last_at: last.loaded_at,
        last_who: last.who,
        last_device: last.device,
        last_ms: last.load_ms,
      });
    }
    routes.sort((a, b) => b.count - a.count);

    // devices
    const byDev = new Map<string, number[]>();
    for (const r of all) {
      const key = r.device ?? "Ukjent";
      const arr = byDev.get(key) ?? [];
      arr.push(r.load_ms);
      byDev.set(key, arr);
    }
    const devices: PageDeviceStat[] = Array.from(byDev.entries())
      .map(([device, arr]) => ({
        device,
        count: arr.length,
        avg_ms: Math.round(arr.reduce((s, x) => s + x, 0) / arr.length),
      }))
      .sort((a, b) => b.count - a.count);

    // daily
    const byDay = new Map<string, { sum: number; count: number }>();
    for (const r of all) {
      const day = r.loaded_at.slice(0, 10);
      const cur = byDay.get(day) ?? { sum: 0, count: 0 };
      cur.sum += r.load_ms;
      cur.count += 1;
      byDay.set(day, cur);
    }
    const daily: PageDailyPoint[] = Array.from(byDay.entries())
      .map(([day, v]) => ({ day, avg_ms: Math.round(v.sum / v.count), count: v.count }))
      .sort((a, b) => a.day.localeCompare(b.day));

    // per user
    const byUser = new Map<string, PageLoadEntry[]>();
    for (const r of all) {
      const key = r.who || "anon";
      const arr = byUser.get(key) ?? [];
      arr.push(r);
      byUser.set(key, arr);
    }
    const users: PageUserStat[] = Array.from(byUser.entries())
      .map(([who, list]) => {
        const sum = list.reduce((s, x) => s + x.load_ms, 0);
        const routeMap = new Map<string, { count: number; last_at: string }>();
        for (const r of list) {
          const cur = routeMap.get(r.route);
          if (cur) {
            cur.count += 1;
            if (r.loaded_at > cur.last_at) cur.last_at = r.loaded_at;
          } else {
            routeMap.set(r.route, { count: 1, last_at: r.loaded_at });
          }
        }
        const routes = Array.from(routeMap.entries())
          .map(([route, v]) => ({ route, count: v.count, last_at: v.last_at }))
          .sort((a, b) => b.count - a.count);
        return {
          who,
          count: list.length,
          avg_ms: Math.round(sum / list.length),
          last_at: list[0].loaded_at,
          routes,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Slowest pages with trend & recommendation (min 5 samples)
    function recommendFor(route: string, avg: number, p95: number, trend: "up" | "down" | "flat", trendPct: number): string {
      const tips: string[] = [];
      if (trend === "up" && trendPct >= 15) tips.push(`Tregere enn før (+${trendPct}%) — sjekk nye endringer på denne siden.`);
      if (p95 > 4000) tips.push("P95 over 4s — vurder code-splitting, lazy-load tunge komponenter eller bilder.");
      else if (avg > 2500) tips.push("Snitt over 2.5s — flytt tunge data-kall til server-loader og cache resultatet.");
      if (/charts?|recharts|chart/i.test(route)) tips.push("Dynamisk import av chart-biblioteket kan kutte initial last.");
      if (/okonomi|skatt|payslip|kvitter/i.test(route)) tips.push("Paginer eller virtualiser store lister/tabeller.");
      if (/api|hooks/i.test(route)) tips.push("Sjekk om eksternt API svarer tregt — vurder cache eller bakgrunnsjobb.");
      if (tips.length === 0) {
        if (avg < 800) tips.push("OK — innenfor 'rask' (<800ms).");
        else tips.push("Vurder å forhåndshente data, redusere antall requests eller komprimere assets.");
      }
      return tips.join(" ");
    }

    const slowest: SlowPageInsight[] = routes
      .filter((r) => r.count >= 5)
      .sort((a, b) => b.avg_ms - a.avg_ms)
      .slice(0, 3)
      .map((r) => {
        const list = byRoute.get(r.route) ?? [];
        // sort by time ascending
        const chrono = [...list].sort((a, b) => a.loaded_at.localeCompare(b.loaded_at));
        const half = Math.max(1, Math.floor(chrono.length / 2));
        const prev = chrono.slice(0, half);
        const recent = chrono.slice(half);
        const avgOf = (xs: PageLoadEntry[]) => xs.length ? Math.round(xs.reduce((s, x) => s + x.load_ms, 0) / xs.length) : 0;
        const prevAvg = avgOf(prev);
        const recentAvg = avgOf(recent);
        const diffPct = prevAvg > 0 ? Math.round(((recentAvg - prevAvg) / prevAvg) * 100) : 0;
        const trend: "up" | "down" | "flat" = Math.abs(diffPct) < 10 ? "flat" : diffPct > 0 ? "up" : "down";
        return {
          route: r.route,
          avg_ms: r.avg_ms,
          p95_ms: r.p95_ms,
          count: r.count,
          recent_avg_ms: recentAvg,
          prev_avg_ms: prevAvg,
          trend,
          trend_pct: Math.abs(diffPct),
          recommendation: recommendFor(r.route, r.avg_ms, r.p95_ms, trend, Math.abs(diffPct)),
        };
      });

    const totalSum = all.reduce((s, r) => s + r.load_ms, 0);
    return {
      routes,
      devices,
      recent: all.slice(0, 100),
      daily,
      users,
      slowest,
      totalCount: all.length,
      avgMs: all.length ? Math.round(totalSum / all.length) : 0,
      sampleLimit: data.limit,
    };
  });


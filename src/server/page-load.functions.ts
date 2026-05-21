import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

export type PageLoadStats = {
  routes: PageRouteStat[];
  devices: PageDeviceStat[];
  recent: PageLoadEntry[];
  daily: PageDailyPoint[];
  totalCount: number;
  avgMs: number;
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
    }).parse,
  )
  .handler(async ({ data }): Promise<PageLoadStats> => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("page_load_log")
      .select("loaded_at, route, who, device, os, load_ms, kind")
      .gte("loaded_at", since)
      .order("loaded_at", { ascending: false })
      .limit(10000);
    if (error) {
      console.warn("[page-load] select failed", error.message);
      return { routes: [], devices: [], recent: [], daily: [], totalCount: 0, avgMs: 0 };
    }

    const all = (rows ?? []) as PageLoadEntry[];
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

    const totalSum = all.reduce((s, r) => s + r.load_ms, 0);
    return {
      routes,
      devices,
      recent: all.slice(0, 100),
      daily,
      totalCount: all.length,
      avgMs: all.length ? Math.round(totalSum / all.length) : 0,
    };
  });

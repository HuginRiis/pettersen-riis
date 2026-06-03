// Server-side helpers for å pause enkelt-API-er totalt eller innenfor
// et tidsvindu. Status lagres i public.api_pause_flags og caches kort i minnet.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isInBlackoutWindow } from "./api-blackout.server";

export class ApiSourcePausedError extends Error {
  constructor(public source: string, reason?: string) {
    super(
      reason
        ? `API-kilden "${source}" er blokkert: ${reason}`
        : `API-kilden "${source}" er pauset fra Vakttårnet`,
    );
    this.name = "ApiSourcePausedError";
  }
}

export type ApiPauseFlag = {
  source: string;
  paused: boolean;
  window_enabled: boolean;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  updated_at: string;
};

type CacheEntry = { flag: ApiPauseFlag | null; expires: number };
const g = globalThis as unknown as { __apiPauseCache?: Map<string, CacheEntry> };
if (!g.__apiPauseCache) g.__apiPauseCache = new Map();
const cache = g.__apiPauseCache;
const TTL_MS = 15_000;

function normTime(t: string | null | undefined): string {
  if (!t) return "00:00";
  const m = /^(\d{2}):(\d{2})/.exec(String(t));
  return m ? `${m[1]}:${m[2]}` : "00:00";
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
}

function osloMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function inWindow(flag: ApiPauseFlag): boolean {
  if (!flag.window_enabled) return false;
  const start = toMinutes(flag.start_time);
  const end = toMinutes(flag.end_time);
  if (start === end) return false;
  const now = osloMinutesNow();
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

async function loadFlag(source: string): Promise<ApiPauseFlag | null> {
  const now = Date.now();
  const hit = cache.get(source);
  if (hit && hit.expires > now) return hit.flag;
  try {
    const { data } = (await (supabaseAdmin.from("api_pause_flags") as any)
      .select("source,paused,window_enabled,start_time,end_time,updated_at")
      .eq("source", source)
      .maybeSingle()) as { data: any };
    const flag: ApiPauseFlag | null = data
      ? {
          source: data.source,
          paused: Boolean(data.paused),
          window_enabled: Boolean(data.window_enabled),
          start_time: normTime(data.start_time),
          end_time: normTime(data.end_time),
          updated_at: data.updated_at,
        }
      : null;
    cache.set(source, { flag, expires: now + TTL_MS });
    return flag;
  } catch {
    return null;
  }
}

export async function isApiSourcePaused(source: string): Promise<boolean> {
  // Master blackout overstyrer alt.
  if (await isInBlackoutWindow()) return true;
  const flag = await loadFlag(source);
  if (!flag) return false;
  if (flag.paused) return true;
  return inWindow(flag);
}

export function invalidateApiPauseCache(source?: string) {
  if (source) cache.delete(source);
  else cache.clear();
}

export async function listApiPauseFlags(): Promise<ApiPauseFlag[]> {
  const { data } = (await (supabaseAdmin.from("api_pause_flags") as any)
    .select("source,paused,window_enabled,start_time,end_time,updated_at")
    .order("source", { ascending: true })) as {
    data: Array<any> | null;
  };
  return (data ?? []).map((d) => ({
    source: d.source,
    paused: Boolean(d.paused),
    window_enabled: Boolean(d.window_enabled),
    start_time: normTime(d.start_time),
    end_time: normTime(d.end_time),
    updated_at: d.updated_at,
  }));
}

export async function setApiSourcePausedDb(source: string, paused: boolean): Promise<void> {
  await (supabaseAdmin.from("api_pause_flags") as any).upsert(
    { source, paused, updated_at: new Date().toISOString() },
    { onConflict: "source" },
  );
  invalidateApiPauseCache(source);
}

export async function setApiSourceWindowDb(
  source: string,
  window_enabled: boolean,
  start_time: string,
  end_time: string,
): Promise<void> {
  await (supabaseAdmin.from("api_pause_flags") as any).upsert(
    {
      source,
      window_enabled,
      start_time: normTime(start_time),
      end_time: normTime(end_time),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source" },
  );
  invalidateApiPauseCache(source);
}

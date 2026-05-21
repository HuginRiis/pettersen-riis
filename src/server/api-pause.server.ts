// Server-side helpers for å pause enkelt-API-er totalt.
// Status lagres i public.api_pause_flags og caches kort i minnet.

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

type CacheEntry = { paused: boolean; expires: number };
const g = globalThis as unknown as { __apiPauseCache?: Map<string, CacheEntry> };
if (!g.__apiPauseCache) g.__apiPauseCache = new Map();
const cache = g.__apiPauseCache;
const TTL_MS = 15_000;

export async function isApiSourcePaused(source: string): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(source);
  if (hit && hit.expires > now) return hit.paused;
  try {
    const { data } = (await (supabaseAdmin.from("api_pause_flags") as any)
      .select("paused")
      .eq("source", source)
      .maybeSingle()) as { data: { paused: boolean } | null };
    const paused = Boolean(data?.paused);
    cache.set(source, { paused, expires: now + TTL_MS });
    return paused;
  } catch {
    return false;
  }
}

export function invalidateApiPauseCache(source?: string) {
  if (source) cache.delete(source);
  else cache.clear();
}

export async function listApiPauseFlags(): Promise<Array<{ source: string; paused: boolean; updated_at: string }>> {
  const { data } = (await (supabaseAdmin.from("api_pause_flags") as any)
    .select("source,paused,updated_at")
    .order("source", { ascending: true })) as {
    data: Array<{ source: string; paused: boolean; updated_at: string }> | null;
  };
  return data ?? [];
}

export async function setApiSourcePausedDb(source: string, paused: boolean): Promise<void> {
  await (supabaseAdmin.from("api_pause_flags") as any).upsert(
    { source, paused, updated_at: new Date().toISOString() },
    { onConflict: "source" },
  );
  invalidateApiPauseCache(source);
}

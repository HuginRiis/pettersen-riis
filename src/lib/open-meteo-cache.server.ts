// Delt in-memory cache + 429-backoff for Open-Meteo air-quality kall.
// Brukes både av panel-fetch og av push-cronen slik at vi maks treffer
// Open-Meteo én gang per nøkkel per TTL, og helt unngår nye kall mens
// vi er rate-limited.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loggedFetch } from "./api-call-log.server";
import { isApiSourcePaused } from "./api-pause.server";

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 min
// Med betalt Open-Meteo-nøkkel (customer-API) har vi egen kvote og bør ikke
// se 429 i normal drift. Holder en kort safety-backoff hvis det skulle skje,
// så vi hopper kun over neste cron-tikk og prøver igjen ved tikket etter.
const BACKOFF_MS = 10 * 60 * 1000;
const KV_PREFIX = "open_meteo_cache:";
const BACKOFF_PREFIX = "open_meteo_backoff:";

type CacheEntry<T> = { value: T; expiresAt: number };
type BackoffEntry = { until: number; endpoint?: string; status?: number };
const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const backoffUntil = new Map<string, number>(); // host -> timestamp

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function backoffKeysFromUrl(url: string): string[] {
  // Per-host backoff. api.open-meteo.com (forecast) og
  // air-quality-api.open-meteo.com har separate kvoter hos Open-Meteo,
  // så vi pauser kun den hosten som faktisk fikk 429.
  return [hostFromUrl(url)];
}


async function readKv<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("notification_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return (data.value as T) ?? null;
  } catch {
    return null;
  }
}

async function writeKv(key: string, value: unknown): Promise<void> {
  try {
    await supabaseAdmin.from("notification_settings").upsert(
      {
        key,
        value: value as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch (err) {
    console.warn("[open-meteo-cache] kv write failed", err);
  }
}

async function getPersistentCache<T>(key: string): Promise<CacheEntry<T> | null> {
  const entry = await readKv<CacheEntry<T>>(`${KV_PREFIX}${key}`);
  if (!entry || typeof entry.expiresAt !== "number") return null;
  cache.set(key, entry as CacheEntry<unknown>);
  return entry;
}

async function setPersistentCache<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  cache.set(key, entry as CacheEntry<unknown>);
  void writeKv(`${KV_PREFIX}${key}`, entry);
}

export async function isBackedOff(url: string): Promise<boolean> {
  const now = Date.now();
  for (const key of backoffKeysFromUrl(url)) {
    const until = backoffUntil.get(key);
    if (until && until > now) return true;
    const entry = await readKv<BackoffEntry>(`${BACKOFF_PREFIX}${key}`);
    if (entry?.until && entry.until > now) {
      backoffUntil.set(key, entry.until);
      return true;
    }
    if (until && until <= now) backoffUntil.delete(key);
  }
  return false;
}

export function markBackoff(url: string, ms: number = BACKOFF_MS, endpoint?: string) {
  const until = Date.now() + ms;
  for (const key of backoffKeysFromUrl(url)) {
    backoffUntil.set(key, until);
    void writeKv(`${BACKOFF_PREFIX}${key}`, { until, endpoint, status: 429 } satisfies BackoffEntry);
  }
}

/**
 * Logged fetch som respekterer 429-backoff. Returnerer null hvis vi
 * for tiden er i backoff (uten å logge nytt kall).
 */
export async function fetchWithBackoff(
  source: string,
  endpoint: string,
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  if (await isApiSourcePaused("open-meteo")) return null;
  if (source !== "open-meteo" && (await isApiSourcePaused(source))) return null;
  if (await isBackedOff(url)) return null;
  const res = await loggedFetch(source, endpoint, url, init);
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const ms = retryAfter ? Math.max(60_000, parseInt(retryAfter, 10) * 1000) : BACKOFF_MS;
    markBackoff(url, Number.isFinite(ms) ? ms : BACKOFF_MS, endpoint);
  }
  return res;
}

export async function withCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  let hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const persisted = await getPersistentCache<T>(key);
  if (persisted) {
    hit = persisted;
    if (persisted.expiresAt > now) return persisted.value;
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const value = await loader();
      await setPersistentCache(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (e) {
      if (hit) return hit.value; // stale-on-error
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * Cache-only-lesing: returnerer KV-cachet verdi (selv om TTL har gått ut)
 * uten å trigge nye Open-Meteo-kall. Brukes av panelene slik at
 * side-oppdateringer KUN serverer cache, mens cron-jobben holder den varm.
 */
export async function readCacheOnly<T>(key: string): Promise<{ value: T; fresh: boolean; expiresAt: number } | null> {
  const now = Date.now();
  const mem = cache.get(key) as CacheEntry<T> | undefined;
  if (mem) return { value: mem.value, fresh: mem.expiresAt > now, expiresAt: mem.expiresAt };
  const persisted = await getPersistentCache<T>(key);
  if (persisted) return { value: persisted.value, fresh: persisted.expiresAt > now, expiresAt: persisted.expiresAt };
  return null;
}




export function getCached<T>(key: string): T | null {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) return null;
  return hit.value;
}

export function setCached<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  return setPersistentCache(key, { value, expiresAt: Date.now() + ttlMs });
}

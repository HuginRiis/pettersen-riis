// Delt in-memory cache + 429-backoff for Open-Meteo air-quality kall.
// Brukes både av panel-fetch og av push-cronen slik at vi maks treffer
// Open-Meteo én gang per nøkkel per TTL, og helt unngår nye kall mens
// vi er rate-limited.

import { loggedFetch } from "./api-call-log.server";

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min
const BACKOFF_MS = 15 * 60 * 1000; // ved 429: ikke prøv igjen på 15 min

type CacheEntry<T> = { value: T; expiresAt: number };
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

export function isBackedOff(url: string): boolean {
  const until = backoffUntil.get(hostFromUrl(url));
  return !!until && until > Date.now();
}

export function markBackoff(url: string, ms: number = BACKOFF_MS) {
  backoffUntil.set(hostFromUrl(url), Date.now() + ms);
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
  if (isBackedOff(url)) return null;
  const res = await loggedFetch(source, endpoint, url, init);
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const ms = retryAfter ? Math.max(60_000, parseInt(retryAfter, 10) * 1000) : BACKOFF_MS;
    markBackoff(url, Number.isFinite(ms) ? ms : BACKOFF_MS);
  }
  return res;
}

export async function withCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const value = await loader();
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
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

export function getCached<T>(key: string): T | null {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) return null;
  return hit.value;
}

export function setCached<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

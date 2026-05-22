// Delt klient-cache for alle header-/menybadges.
// Mål: badges skal IKKE generere nye API-spørringer hver gang topp-menyen
// åpnes eller badget remountes. Første gang en badge ber om data fyller den
// cachen; senere mounts/menyåpninger leser kun fra cachen. Cachen oppdateres
// først når en faktisk side/komponent kaller `setBadgeCache(key, data)` (typisk
// fra panelet som eier dataen — eller når TTL går ut og noen ber om data igjen).
//
// Bruk:
//   const v = useBadgeCache<MyType>("alarm-state", fetcher, { ttlMs: 10*60_000 });
//   // ...og fra et panel som henter samme data ekte:
//   setBadgeCache("alarm-state", data);

import { useEffect, useState } from "react";

type Entry<T> = { at: number; data: T };

const cache = new Map<string, Entry<any>>();
const inflight = new Map<string, Promise<any>>();
const listeners = new Map<string, Set<(v: any) => void>>();

const DEFAULT_TTL = 10 * 60_000; // 10 min

export function getBadgeCache<T = unknown>(key: string, ttlMs = DEFAULT_TTL): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > ttlMs) return null;
  return e.data as T;
}

export function setBadgeCache<T>(key: string, data: T) {
  cache.set(key, { at: Date.now(), data });
  const ls = listeners.get(key);
  if (ls) for (const l of ls) l(data);
}

export function invalidateBadgeCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}

export function subscribeBadge<T = unknown>(key: string, cb: (v: T | null) => void): () => void {
  let ls = listeners.get(key);
  if (!ls) {
    ls = new Set();
    listeners.set(key, ls);
  }
  ls.add(cb as (v: any) => void);
  return () => {
    ls!.delete(cb as (v: any) => void);
  };
}

/**
 * Hook for badges. Returnerer cached verdi umiddelbart (null hvis tom/utgått).
 * Trigger fetcher KUN hvis cachen er tom/utgått — og kun én gang per nøkkel
 * (inflight-dedup). Re-mounts som har frisk cache fører ikke til ny henting.
 */
export function useBadgeCache<T>(
  key: string,
  fetcher: () => Promise<T | null>,
  opts: { ttlMs?: number } = {},
): T | null {
  const ttl = opts.ttlMs ?? DEFAULT_TTL;
  const [v, setV] = useState<T | null>(() => getBadgeCache<T>(key, ttl));

  useEffect(() => {
    const unsub = subscribeBadge<T>(key, (nv) => setV(nv));
    const fresh = getBadgeCache<T>(key, ttl);
    if (fresh != null) {
      setV(fresh);
      return unsub;
    }
    const pending = inflight.get(key);
    if (pending) {
      pending.then((d) => setV(d as T | null)).catch(() => {});
      return unsub;
    }
    const p = (async () => {
      try {
        const d = await fetcher();
        if (d != null) setBadgeCache(key, d);
        return d;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    p.then((d) => setV(d as T | null)).catch(() => {});
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttl]);

  return v;
}

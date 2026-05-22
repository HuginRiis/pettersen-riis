// Delt klient-cache for Strava dashboard. Persistert i localStorage slik at
// badges i topp-menyen kan vises umiddelbart når appen åpnes på nytt — uten
// å trigge nye Strava-kall. TTL 1 time; fersk henting skjer kun via
// `loadStrava()` (kalt fra /fysisk) eller manuell "Oppdater".
import { getStravaDashboard } from "@/server/strava";

type Owner = "arne" | "rebekka";
type Entry = { at: number; data: any };

const TTL_MS = 60 * 60 * 1000;
const STORAGE_PREFIX = "strava-dash-cache:v1:";

const cache = new Map<Owner, Entry>();
const inflight = new Map<Owner, Promise<any>>();
const listeners = new Map<Owner, Set<(d: any) => void>>();

// Hydrer fra localStorage ved modul-init (klient)
if (typeof window !== "undefined") {
  for (const owner of ["arne", "rebekka"] as Owner[]) {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + owner);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Entry;
      if (parsed && typeof parsed.at === "number" && parsed.data) {
        cache.set(owner, parsed);
      }
    } catch {
      /* ignore */
    }
  }
}

function persist(owner: Owner, entry: Entry | null) {
  if (typeof window === "undefined") return;
  try {
    if (entry) {
      window.localStorage.setItem(STORAGE_PREFIX + owner, JSON.stringify(entry));
    } else {
      window.localStorage.removeItem(STORAGE_PREFIX + owner);
    }
  } catch {
    /* ignore */
  }
}

function emit(owner: Owner, data: any) {
  const ls = listeners.get(owner);
  if (ls) for (const l of ls) l(data);
}

export function getCachedStrava(owner: Owner): any | null {
  const e = cache.get(owner);
  if (!e) return null;
  // Returner persistert data også etter TTL — badges skal vise siste kjente
  // verdi til en faktisk ny henting overskriver den.
  return e.data;
}

export function isStravaCacheFresh(owner: Owner): boolean {
  const e = cache.get(owner);
  if (!e) return false;
  return Date.now() - e.at < TTL_MS;
}

export function subscribeStrava(owner: Owner, cb: (d: any) => void): () => void {
  let ls = listeners.get(owner);
  if (!ls) {
    ls = new Set();
    listeners.set(owner, ls);
  }
  ls.add(cb);
  return () => {
    ls!.delete(cb);
  };
}

export function invalidateStrava(owner?: Owner) {
  if (owner) {
    cache.delete(owner);
    persist(owner, null);
  } else {
    for (const o of Array.from(cache.keys())) {
      cache.delete(o);
      persist(o, null);
    }
  }
}

export async function loadStrava(owner: Owner): Promise<any> {
  if (isStravaCacheFresh(owner)) return getCachedStrava(owner);
  const pending = inflight.get(owner);
  if (pending) return pending;
  const p = (async () => {
    try {
      const r: any = await getStravaDashboard({ data: { owner } });
      const entry: Entry = { at: Date.now(), data: r };
      cache.set(owner, entry);
      persist(owner, entry);
      emit(owner, r);
      return r;
    } finally {
      inflight.delete(owner);
    }
  })();
  inflight.set(owner, p);
  return p;
}

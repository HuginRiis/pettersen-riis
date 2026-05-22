// Delt klient-cache for Strava dashboard. Holder data per eier i 15 min slik
// at åpning av topp-meny / navigering / re-mount av badges ikke trigger nye
// serverFn-kall. Eneste vei til ny henting er manuell "Oppdater"-knapp som
// kaller `invalidateStrava(owner)` før neste hent.
import { getStravaDashboard } from "@/server/strava";

type Owner = "arne" | "rebekka";
type Entry = { at: number; data: any };

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<Owner, Entry>();
const inflight = new Map<Owner, Promise<any>>();

export function getCachedStrava(owner: Owner): any | null {
  const e = cache.get(owner);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) return null;
  return e.data;
}

export function invalidateStrava(owner?: Owner) {
  if (owner) cache.delete(owner);
  else cache.clear();
}

export async function loadStrava(owner: Owner): Promise<any> {
  const fresh = getCachedStrava(owner);
  if (fresh) return fresh;
  const pending = inflight.get(owner);
  if (pending) return pending;
  const p = (async () => {
    try {
      const r: any = await getStravaDashboard({ data: { owner } });
      cache.set(owner, { at: Date.now(), data: r });
      return r;
    } finally {
      inflight.delete(owner);
    }
  })();
  inflight.set(owner, p);
  return p;
}

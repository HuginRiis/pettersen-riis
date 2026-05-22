// Delt klient-cache for Gardena-snapshot.
// - Persistert i localStorage med timestamp (TTL 1 time)
// - Auto-henting kun hvis cache er eldre enn 1 time OG ikke i nattevindu (22:00–06:00)
// - Manuell "Oppdater"-knapp på /gressklipper omgår TTL men respekterer cooldown lokalt

import type { getGardenaSnapshot } from "@/lib/gardena.functions";

export type GardenaSnap = Awaited<ReturnType<typeof getGardenaSnapshot>>;

const STORAGE_KEY = "gardena-snap-cache:v1";
export const GARDENA_TTL_MS = 60 * 60 * 1000; // 1 time

type Stored = { snap: GardenaSnap; fetchedAt: number };

let current: GardenaSnap | null = null;
let currentFetchedAt = 0;
const listeners = new Set<(s: GardenaSnap | null) => void>();

// Hydrer fra localStorage ved modul-init
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Stored;
      if (parsed?.snap && typeof parsed.fetchedAt === "number") {
        current = parsed.snap;
        currentFetchedAt = parsed.fetchedAt;
      }
    }
  } catch {
    /* ignore */
  }
}

export function getCachedGardena(): GardenaSnap | null {
  return current;
}

export function getCachedGardenaAge(): number {
  if (!currentFetchedAt) return Number.POSITIVE_INFINITY;
  return Date.now() - currentFetchedAt;
}

export function isGardenaCacheFresh(): boolean {
  return getCachedGardenaAge() < GARDENA_TTL_MS;
}

export function setCachedGardena(snap: GardenaSnap | null) {
  current = snap;
  currentFetchedAt = snap ? Date.now() : 0;
  if (typeof window !== "undefined") {
    try {
      if (snap) {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ snap, fetchedAt: currentFetchedAt } satisfies Stored),
        );
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }
  for (const l of listeners) l(current);
}

export function subscribeGardena(cb: (s: GardenaSnap | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** True hvis vi er i nattevindu Europe/Oslo (22:00–06:00). */
export function isGardenaNightWindow(now: Date = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    return h >= 22 || h < 6;
  } catch {
    const h = now.getHours();
    return h >= 22 || h < 6;
  }
}

// Delt klient-cache for Gardena-snapshot.
// Ingen automatisk henting — kun manuelt via "Oppdater"-knappen på /gressklipper.
// Badges abonnerer på cachen og viser data kun hvis den finnes.

import type { getGardenaSnapshot } from "@/lib/gardena.functions";

export type GardenaSnap = Awaited<ReturnType<typeof getGardenaSnapshot>>;

let current: GardenaSnap | null = null;
const listeners = new Set<(s: GardenaSnap | null) => void>();

export function getCachedGardena(): GardenaSnap | null {
  return current;
}

export function setCachedGardena(snap: GardenaSnap | null) {
  current = snap;
  for (const l of listeners) l(current);
}

export function subscribeGardena(cb: (s: GardenaSnap | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

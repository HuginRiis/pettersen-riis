import { useEffect, useRef, useState } from "react";

/**
 * Husker siste gyldige (finite) tallverdi i localStorage og returnerer den
 * som fallback når live-verdien er null/undefined. Stabiliserer UI-tall
 * (f.eks. temperatur) når en API-poll mislykkes eller returnerer tom.
 *
 * Returnerer { value, stale } — stale=true betyr at vi viser cachet verdi.
 */
export type LastGood = { value: number; at: number } | null;

export function useLastGood(
  storageKey: string,
  value: number | null | undefined,
  maxAgeMs: number = 6 * 60 * 60 * 1000, // 6 timer
): { value: number | null; stale: boolean; at: number | null } {
  const [stored, setStored] = useState<LastGood>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as LastGood;
        if (parsed && Number.isFinite(parsed.value)) setStored(parsed);
      }
    } catch {}
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    const next: LastGood = { value: value as number, at: Date.now() };
    setStored(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }, [storageKey, value]);

  if (value !== null && value !== undefined && Number.isFinite(value)) {
    return { value: value as number, stale: false, at: Date.now() };
  }
  if (stored && Date.now() - stored.at <= maxAgeMs) {
    return { value: stored.value, stale: true, at: stored.at };
  }
  return { value: null, stale: false, at: null };
}

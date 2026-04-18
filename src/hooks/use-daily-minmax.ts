import { useEffect, useRef, useState } from "react";

/**
 * Tracks min/max for a numeric value, persisted in localStorage and reset
 * automatically at midnight (local time). Returns null until first value
 * is observed and on the server (SSR-safe).
 */
export type MinMax = { min: number; max: number; date: string } | null;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readStored(storageKey: string): MinMax {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MinMax;
    if (!parsed || parsed.date !== todayKey()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useDailyMinMax(storageKey: string, value: number | null): MinMax {
  const [state, setState] = useState<MinMax>(null);
  const hydrated = useRef(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setState(readStored(storageKey));
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (value === null || !Number.isFinite(value)) return;
    const today = todayKey();
    setState((prev) => {
      const base =
        prev && prev.date === today
          ? prev
          : { min: value, max: value, date: today };
      const next = {
        date: today,
        min: Math.min(base.min, value),
        max: Math.max(base.max, value),
      };
      if (
        prev &&
        prev.date === next.date &&
        prev.min === next.min &&
        prev.max === next.max
      ) {
        return prev;
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore quota
      }
      return next;
    });
  }, [storageKey, value]);

  return state;
}

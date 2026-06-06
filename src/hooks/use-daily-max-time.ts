import { useEffect, useRef, useState } from "react";

/**
 * Sporer daglig maks-verdi + tidspunktet den ble nådd. Persisteres i
 * localStorage og nullstilles ved midnatt (lokal tid).
 */
export type MaxAt = { max: number; at: number; date: string } | null;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readStored(storageKey: string): MaxAt {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MaxAt;
    if (!parsed || parsed.date !== todayKey()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useDailyMaxTime(storageKey: string, value: number | null): MaxAt {
  const [state, setState] = useState<MaxAt>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    setState(readStored(storageKey));
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (value === null || !Number.isFinite(value)) return;
    const today = todayKey();
    setState((prev) => {
      if (!prev || prev.date !== today) {
        const next = { max: value, at: Date.now(), date: today };
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
        return next;
      }
      if (value > prev.max) {
        const next = { max: value, at: Date.now(), date: today };
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
        return next;
      }
      return prev;
    });
  }, [storageKey, value]);

  return state;
}

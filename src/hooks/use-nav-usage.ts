import { useEffect, useState, useCallback } from "react";

/**
 * Lett, klient-side telling av hvor mange ganger en bruker har besøkt en
 * gitt menyside. Lagres i localStorage pr. (who, path). Brukes for å sortere
 * meny-elementene slik at mest brukte havner øverst.
 */
const STORAGE_PREFIX = "nav-usage:v1:";

export type NavUsageMap = Record<string, number>;

function storageKey(who: string) {
  return `${STORAGE_PREFIX}${who || "anon"}`;
}

function readUsage(who: string): NavUsageMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(who));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as NavUsageMap;
  } catch {
    // ignore
  }
  return {};
}

function writeUsage(who: string, map: NavUsageMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(who), JSON.stringify(map));
  } catch {
    // ignore (quota etc.)
  }
}

export function useNavUsage(who: string) {
  const [usage, setUsage] = useState<NavUsageMap>({});

  useEffect(() => {
    setUsage(readUsage(who));
  }, [who]);

  // Lytt på endringer fra andre faner / komponenter
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(who)) {
        setUsage(readUsage(who));
      }
    };
    const onCustom = () => setUsage(readUsage(who));
    window.addEventListener("storage", onStorage);
    window.addEventListener("nav-usage-updated", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("nav-usage-updated", onCustom);
    };
  }, [who]);

  const bump = useCallback(
    (path: string) => {
      const next = { ...readUsage(who) };
      next[path] = (next[path] ?? 0) + 1;
      writeUsage(who, next);
      setUsage(next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("nav-usage-updated"));
      }
    },
    [who],
  );

  return { usage, bump };
}

import { useEffect, useRef, useState } from "react";

/**
 * useState som lagres i localStorage og hydreres etter mount (SSR-safe).
 * Bruk en stabil nøkkel per felt.
 */
export function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {}
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}

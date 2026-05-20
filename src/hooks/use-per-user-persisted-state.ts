import { useEffect, useRef, useState } from "react";
import { getStoredWho } from "@/lib/push-client";

/**
 * useState lagret i localStorage knyttet til aktuell push-bruker (who).
 * Verdien hydreres etter mount (SSR-safe), og oppdateres automatisk
 * når brukeren byttes i et annet vindu/fane (storage-event på agenda_push_who).
 *
 * Lagringsnøkkel: `${key}::${who}`
 */
export function usePerUserPersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [who, setWho] = useState<string>("Alle");
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  // Hydrer fra localStorage (bruker who fra push-client)
  useEffect(() => {
    const currentWho = getStoredWho();
    setWho(currentWho);
    try {
      const raw = localStorage.getItem(`${key}::${currentWho}`);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {}
    hydrated.current = true;
  }, [key]);

  // Lytt etter who-endring (fra setStoredWho i andre faner)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "agenda_push_who") {
        const newWho = getStoredWho();
        setWho(newWho);
        try {
          const raw = localStorage.getItem(`${key}::${newWho}`);
          setValue(raw !== null ? (JSON.parse(raw) as T) : initial);
        } catch {
          setValue(initial);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Skriv tilbake
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(`${key}::${who}`, JSON.stringify(value));
    } catch {}
  }, [key, who, value]);

  return [value, setValue];
}

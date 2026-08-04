import { useCallback, useEffect, useRef, useState } from "react";
import { getLinketurState, setLinketurState } from "@/lib/linketur-state.functions";

/**
 * Delt Linketur-state: leses fra og lagres i databasen (felles for alle enheter).
 * localStorage brukes kun som lokal cache / offline-fallback, og migreres opp
 * til serveren første gang hvis serveren er tom.
 */
export function useSharedLinketurState<T extends Record<string, unknown>>(
  key: "cabins" | "crew",
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>, { loaded: boolean; saving: boolean; error: string | null }] {
  const storageKey = `linketur:${key}`;
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Last inn
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let local: T | null = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) local = JSON.parse(raw) as T;
      } catch {
        /* ignorer */
      }

      try {
        const res = await getLinketurState({ data: { key } });
        const remote = res.json ? (JSON.parse(res.json) as T) : null;
        if (cancelled) return;
        if (remote && Object.keys(remote).length > 0) {
          setValue(remote);
          try {
            localStorage.setItem(storageKey, JSON.stringify(remote));
          } catch {
            /* ignorer */
          }
        } else if (local) {
          // Migrer eksisterende lokale data opp til serveren
          setValue(local);
          try {
            await setLinketurState({ data: { key, value: local } });
          } catch {
            /* ignorer */
          }
        }
      } catch (e) {
        if (cancelled) return;
        if (local) setValue(local);
        setError(e instanceof Error ? e.message : "Kunne ikke hente delte data.");
      } finally {
        if (!cancelled) {
          ready.current = true;
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Lagre (debounced)
  useEffect(() => {
    if (!ready.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignorer */
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await setLinketurState({ data: { key, value } });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kunne ikke lagre til serveren.");
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key]);

  const set = useCallback<React.Dispatch<React.SetStateAction<T>>>((next) => {
    setValue((prev) => (typeof next === "function" ? (next as (p: T) => T)(prev) : next));
  }, []);

  return [value, set, { loaded, saving, error }];
}

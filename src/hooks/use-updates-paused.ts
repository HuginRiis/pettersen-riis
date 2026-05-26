import { useEffect, useState } from "react";

const KEY = "app.updates.paused";
const EVENT = "app:updates-paused-change";

export function getUpdatesPaused(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setUpdatesPaused(paused: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, paused ? "1" : "0");
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: paused }));
}

/**
 * Global pause-bryter for alle auto-oppdateringer (polling, intervals,
 * router.invalidate-tikk osv.). Lagres i localStorage og synker mellom faner.
 */
export function useUpdatesPaused(): [boolean, (next: boolean) => void] {
  const [paused, setPaused] = useState<boolean>(false);

  useEffect(() => {
    setPaused(getUpdatesPaused());
    const onChange = () => setPaused(getUpdatesPaused());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setPaused(getUpdatesPaused());
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return [paused, setUpdatesPaused];
}

import { useCallback, useEffect, useState } from "react";

const KEY = "menu.webFavoritesEnabled";
const EVT = "web-favorites-menu-updated";

function read(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function useWebFavoritesMenu() {
  const [enabled, setEnabled] = useState<boolean>(() => read());

  useEffect(() => {
    const sync = () => setEnabled(read());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) sync(); };
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", onStorage);
    sync();
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const set = useCallback((v: boolean) => {
    setEnabled(v);
    try {
      window.localStorage.setItem(KEY, v ? "1" : "0");
      window.dispatchEvent(new CustomEvent(EVT));
    } catch { /* ignore */ }
  }, []);

  return { enabled, setEnabled: set };
}

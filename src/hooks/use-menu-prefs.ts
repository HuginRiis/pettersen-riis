import { useCallback, useEffect, useState } from "react";

const KEY = "menu-prefs:v1";
const EVT = "menu-prefs-updated";

export type MenuPrefs = {
  sortByUsage: boolean;
  favoritesEnabled: boolean;
  favorites: string[]; // route paths, in display order
};

const DEFAULTS: MenuPrefs = {
  sortByUsage: false,
  favoritesEnabled: true,
  favorites: [],
};

function read(): MenuPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<MenuPrefs>;
    return {
      sortByUsage: parsed.sortByUsage ?? DEFAULTS.sortByUsage,
      favoritesEnabled: parsed.favoritesEnabled ?? DEFAULTS.favoritesEnabled,
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    };
  } catch {
    return DEFAULTS;
  }
}

function write(next: MenuPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* ignore */
  }
}

export function useMenuPrefs() {
  const [prefs, setPrefs] = useState<MenuPrefs>(DEFAULTS);

  useEffect(() => {
    setPrefs(read());
    const onUpd = () => setPrefs(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setPrefs(read());
    };
    window.addEventListener(EVT, onUpd);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, onUpd);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setSortByUsage = useCallback((v: boolean) => {
    const next = { ...read(), sortByUsage: v };
    write(next);
    setPrefs(next);
  }, []);

  const setFavoritesEnabled = useCallback((v: boolean) => {
    const next = { ...read(), favoritesEnabled: v };
    write(next);
    setPrefs(next);
  }, []);

  const toggleFavorite = useCallback((path: string) => {
    const cur = read();
    const has = cur.favorites.includes(path);
    const favorites = has ? cur.favorites.filter((p) => p !== path) : [...cur.favorites, path];
    const next = { ...cur, favorites };
    write(next);
    setPrefs(next);
  }, []);

  return { prefs, setSortByUsage, setFavoritesEnabled, toggleFavorite };
}

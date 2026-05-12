import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredWho } from "@/lib/push-client";

export type MenuPrefs = {
  sortByUsage: boolean;
  favoritesEnabled: boolean;
  favorites: string[];
  favoriteZones: string[];
  useGlobalLightScenes: boolean;
};

const DEFAULTS: MenuPrefs = {
  sortByUsage: false,
  favoritesEnabled: true,
  favorites: [],
  favoriteZones: [],
  useGlobalLightScenes: true,
};

const EVT = "menu-prefs-updated";
const LEGACY_KEY = "menu-prefs:v1";

function whoKey(): string {
  try {
    const w = getStoredWho();
    return w || "Alle";
  } catch {
    return "Alle";
  }
}

// In-memory cache per who so navigations don't re-fetch on every mount.
const cache = new Map<string, MenuPrefs>();

async function loadFromDb(who: string): Promise<MenuPrefs> {
  const { data } = await supabase
    .from("user_menu_prefs")
    .select("favorites, sort_by_usage, favorites_enabled, favorite_zones, use_global_light_scenes")
    .eq("who", who)
    .maybeSingle();
  if (data) {
    return {
      favorites: Array.isArray(data.favorites) ? (data.favorites as string[]) : [],
      sortByUsage: !!data.sort_by_usage,
      favoritesEnabled: data.favorites_enabled !== false,
      favoriteZones: Array.isArray((data as any).favorite_zones) ? ((data as any).favorite_zones as string[]) : [],
      useGlobalLightScenes: !!(data as any).use_global_light_scenes,
    };
  }
  // Migrate from legacy localStorage on first load (only for "me").
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MenuPrefs>;
        const seeded: MenuPrefs = {
          favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
          sortByUsage: parsed.sortByUsage ?? false,
          favoritesEnabled: parsed.favoritesEnabled ?? true,
          favoriteZones: Array.isArray(parsed.favoriteZones) ? parsed.favoriteZones : [],
          useGlobalLightScenes: parsed.useGlobalLightScenes ?? true,
        };
        await save(who, seeded);
        return seeded;
      }
    } catch { /* ignore */ }
  }
  return DEFAULTS;
}

async function save(who: string, next: MenuPrefs) {
  cache.set(who, next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVT, { detail: { who } }));
  }
  await supabase.from("user_menu_prefs").upsert(
    {
      who,
      favorites: next.favorites,
      sort_by_usage: next.sortByUsage,
      favorites_enabled: next.favoritesEnabled,
      favorite_zones: next.favoriteZones,
      use_global_light_scenes: next.useGlobalLightScenes,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "who" },
  );
}

export function useMenuPrefs() {
  const [who, setWho] = useState<string>(whoKey());
  const [prefs, setPrefs] = useState<MenuPrefs>(() => cache.get(whoKey()) ?? DEFAULTS);

  // React if push-receiver changes on this device.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "agenda_push_who") setWho(whoKey());
    };
    const onUpd = () => {
      const cached = cache.get(whoKey());
      if (cached) setPrefs(cached);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT, onUpd);
    // Re-check current who in case it was set after mount
    setWho(whoKey());
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT, onUpd);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await loadFromDb(who);
      if (cancelled) return;
      cache.set(who, next);
      setPrefs(next);
    })();
    return () => { cancelled = true; };
  }, [who]);

  const update = useCallback(
    (patch: Partial<MenuPrefs>) => {
      const cur = cache.get(who) ?? prefs;
      const next = { ...cur, ...patch };
      cache.set(who, next);
      setPrefs(next);
      void save(who, next);
    },
    [who, prefs],
  );

  const setSortByUsage = useCallback((v: boolean) => update({ sortByUsage: v }), [update]);
  const setFavoritesEnabled = useCallback((v: boolean) => update({ favoritesEnabled: v }), [update]);
  const toggleFavorite = useCallback(
    (path: string) => {
      const cur = cache.get(who) ?? prefs;
      const has = cur.favorites.includes(path);
      const favorites = has ? cur.favorites.filter((p) => p !== path) : [...cur.favorites, path];
      update({ favorites });
    },
    [who, prefs, update],
  );

  const toggleFavoriteZone = useCallback(
    (zone: string) => {
      const cur = cache.get(who) ?? prefs;
      const has = cur.favoriteZones.includes(zone);
      const favoriteZones = has
        ? cur.favoriteZones.filter((z) => z !== zone)
        : [...cur.favoriteZones, zone];
      update({ favoriteZones });
    },
    [who, prefs, update],
  );
  const setFavoriteZones = useCallback(
    (zones: string[]) => update({ favoriteZones: zones }),
    [update],
  );
  const moveFavoriteZone = useCallback(
    (zone: string, dir: -1 | 1) => {
      const cur = cache.get(who) ?? prefs;
      const arr = [...cur.favoriteZones];
      const idx = arr.indexOf(zone);
      if (idx < 0) return;
      const next = idx + dir;
      if (next < 0 || next >= arr.length) return;
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      update({ favoriteZones: arr });
    },
    [who, prefs, update],
  );

  const setUseGlobalLightScenes = useCallback(
    (v: boolean) => update({ useGlobalLightScenes: v }),
    [update],
  );

  return { prefs, setSortByUsage, setFavoritesEnabled, toggleFavorite, toggleFavoriteZone, setFavoriteZones, moveFavoriteZone, setUseGlobalLightScenes };
}

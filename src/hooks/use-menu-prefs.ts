import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredWho } from "@/lib/push-client";

export type MenuFolder = {
  id: string;
  name: string;
  position: "top" | "bottom";
  items: string[];
};

export type MenuPrefs = {
  sortByUsage: boolean;
  favoritesEnabled: boolean;
  favorites: string[];
  favoriteZones: string[];
  useGlobalLightScenes: boolean;
  menuFolders: MenuFolder[];
};

const DEFAULTS: MenuPrefs = {
  sortByUsage: false,
  favoritesEnabled: true,
  favorites: [],
  favoriteZones: [],
  useGlobalLightScenes: true,
  menuFolders: [],
};

function coerceFolders(value: unknown): MenuFolder[] {
  if (!Array.isArray(value)) return [];
  const out: MenuFolder[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const id = typeof v.id === "string" && v.id ? v.id : `f_${Math.random().toString(36).slice(2, 9)}`;
    const name = typeof v.name === "string" ? v.name : "Katalog";
    const position = v.position === "bottom" ? "bottom" : "top";
    const items = Array.isArray(v.items)
      ? (v.items as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    out.push({ id, name, position, items });
  }
  return out;
}

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
    .select("favorites, sort_by_usage, favorites_enabled, favorite_zones, use_global_light_scenes, menu_folders")
    .eq("who", who)
    .maybeSingle();
  if (data) {
    return {
      favorites: Array.isArray(data.favorites) ? (data.favorites as string[]) : [],
      sortByUsage: !!data.sort_by_usage,
      favoritesEnabled: data.favorites_enabled !== false,
      favoriteZones: Array.isArray((data as any).favorite_zones) ? ((data as any).favorite_zones as string[]) : [],
      useGlobalLightScenes: !!(data as any).use_global_light_scenes,
      menuFolders: coerceFolders((data as any).menu_folders),
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
          menuFolders: coerceFolders((parsed as any).menuFolders),
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
      menu_folders: next.menuFolders as any,
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

  const setMenuFolders = useCallback(
    (folders: MenuFolder[]) => update({ menuFolders: folders }),
    [update],
  );

  const addMenuFolder = useCallback(
    (name: string, position: "top" | "bottom" = "top") => {
      const cur = cache.get(who) ?? prefs;
      const folder: MenuFolder = {
        id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim() || "Katalog",
        position,
        items: [],
      };
      update({ menuFolders: [...(cur.menuFolders ?? []), folder] });
    },
    [who, prefs, update],
  );

  const renameMenuFolder = useCallback(
    (id: string, name: string) => {
      const cur = cache.get(who) ?? prefs;
      update({
        menuFolders: (cur.menuFolders ?? []).map((f) =>
          f.id === id ? { ...f, name: name.trim() || f.name } : f,
        ),
      });
    },
    [who, prefs, update],
  );

  const deleteMenuFolder = useCallback(
    (id: string) => {
      const cur = cache.get(who) ?? prefs;
      update({ menuFolders: (cur.menuFolders ?? []).filter((f) => f.id !== id) });
    },
    [who, prefs, update],
  );

  const setMenuFolderPosition = useCallback(
    (id: string, position: "top" | "bottom") => {
      const cur = cache.get(who) ?? prefs;
      update({
        menuFolders: (cur.menuFolders ?? []).map((f) =>
          f.id === id ? { ...f, position } : f,
        ),
      });
    },
    [who, prefs, update],
  );

  const toggleMenuFolderItem = useCallback(
    (id: string, path: string) => {
      const cur = cache.get(who) ?? prefs;
      // Remove the path from any other folder first (a page belongs to one folder).
      const cleaned = (cur.menuFolders ?? []).map((f) =>
        f.id === id ? f : { ...f, items: f.items.filter((p) => p !== path) },
      );
      update({
        menuFolders: cleaned.map((f) => {
          if (f.id !== id) return f;
          const has = f.items.includes(path);
          return { ...f, items: has ? f.items.filter((p) => p !== path) : [...f.items, path] };
        }),
      });
    },
    [who, prefs, update],
  );

  const moveMenuFolder = useCallback(
    (id: string, dir: -1 | 1) => {
      const cur = cache.get(who) ?? prefs;
      const arr = [...(cur.menuFolders ?? [])];
      const idx = arr.findIndex((f) => f.id === id);
      if (idx < 0) return;
      const next = idx + dir;
      if (next < 0 || next >= arr.length) return;
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      update({ menuFolders: arr });
    },
    [who, prefs, update],
  );

  return {
    prefs,
    setSortByUsage,
    setFavoritesEnabled,
    toggleFavorite,
    toggleFavoriteZone,
    setFavoriteZones,
    moveFavoriteZone,
    setUseGlobalLightScenes,
    setMenuFolders,
    addMenuFolder,
    renameMenuFolder,
    deleteMenuFolder,
    setMenuFolderPosition,
    toggleMenuFolderItem,
    moveMenuFolder,
  };
}

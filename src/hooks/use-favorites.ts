import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Favorite = {
  id: string;
  path: string;
  title: string;
  icon: string | null;
};

let cache: Favorite[] | null = null;
const listeners = new Set<(favs: Favorite[]) => void>();

function notify(next: Favorite[]) {
  cache = next;
  listeners.forEach((l) => l(next));
}

async function loadFavorites(): Promise<Favorite[]> {
  const { data, error } = await supabase
    .from("user_favorites")
    .select("id, path, title, icon")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as Favorite[];
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    listeners.add(setFavorites);
    if (cache === null) {
      loadFavorites().then((favs) => {
        notify(favs);
        setLoading(false);
      });
    }
    return () => {
      listeners.delete(setFavorites);
    };
  }, []);

  const isFavorite = useCallback(
    (path: string) => favorites.some((f) => f.path === path),
    [favorites],
  );

  const toggleFavorite = useCallback(
    async (path: string, title: string, icon?: string) => {
      const existing = favorites.find((f) => f.path === path);
      if (existing) {
        // Optimistic remove
        notify(favorites.filter((f) => f.id !== existing.id));
        const { error } = await supabase
          .from("user_favorites")
          .delete()
          .eq("id", existing.id);
        if (error) {
          // Revert
          const fresh = await loadFavorites();
          notify(fresh);
        }
      } else {
        const { data, error } = await supabase
          .from("user_favorites")
          .insert({ path, title, icon: icon ?? null })
          .select("id, path, title, icon")
          .single();
        if (!error && data) {
          notify([...favorites, data as Favorite]);
        }
      }
    },
    [favorites],
  );

  return { favorites, loading, isFavorite, toggleFavorite };
}

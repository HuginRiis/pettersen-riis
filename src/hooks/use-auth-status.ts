import { useEffect, useState } from "react";
import { checkAuth } from "@/lib/auth.functions";

/**
 * Lightweight client-side hook that tells us whether the current visitor has
 * passed through the castle gates (logged in). Used to conditionally show
 * protected halls in the home grid and the navigation menu.
 */
export function useAuthStatus() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkAuth()
      .then((res) => {
        if (!cancelled) setAuthenticated(res.authenticated === true);
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { authenticated, loading: authenticated === null };
}

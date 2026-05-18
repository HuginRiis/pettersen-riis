import { useEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { getStoredWho } from "@/lib/push-client";

const KEY_PREFIX = "last_route_";

// Ruter vi aldri lagrer/restorer til (login er transient).
const SKIP_RESTORE = new Set<string>(["/login"]);

function storageKey(who: string) {
  return `${KEY_PREFIX}${who}`;
}

function readLastRoute(who: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(storageKey(who));
    return v && v.startsWith("/") ? v : null;
  } catch {
    return null;
  }
}

function writeLastRoute(who: string, path: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(who), path);
  } catch { /* ignore quota */ }
}

/**
 * - Husker siste rute pr push-bruker (who) i localStorage.
 * - Ved første oppstart: hvis vi lander på "/" uten login-dialog, naviger til lagret rute.
 * - Når appen blir synlig igjen (visibilitychange), kall router.invalidate() for å oppdatere data.
 */
export function LastRouteMemory() {
  const router = useRouter();
  const location = useRouterState({ select: (s) => s.location });
  const restoredRef = useRef(false);

  // Lagre siste rute hver gang den endrer seg
  useEffect(() => {
    const path = location.pathname;
    if (!path || SKIP_RESTORE.has(path)) return;
    const who = getStoredWho();
    writeLastRoute(who, path + (location.searchStr ?? ""));
  }, [location.pathname, location.searchStr]);

  // Auto-restore ved oppstart
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === "undefined") return;
    const path = location.pathname;
    if (!SKIP_RESTORE.has(path)) return;
    // Ikke restore hvis login-dialogen åpnes via ?login=1
    const search = new URLSearchParams(window.location.search);
    if (search.get("login") === "1") return;
    const who = getStoredWho();
    const last = readLastRoute(who);
    if (!last || last === path) return;
    void router.navigate({ to: last as never, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh når appen kommer tilbake i forgrunnen
  useEffect(() => {
    if (typeof document === "undefined") return;
    let lastRefresh = Date.now();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // Throttle: ikke oftere enn hvert 5. sekund
      const now = Date.now();
      if (now - lastRefresh < 5000) return;
      lastRefresh = now;
      void router.invalidate();
    };
    const onFocus = () => onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return null;
}

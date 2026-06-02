import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { getNameForCurrentIp } from "@/lib/user-locations.functions";

let cache: string | null = null;
const listeners = new Set<(v: string) => void>();

/**
 * Current "who" — name of the user on this device/IP.
 * "anon" when not authed. Cached across the app so we don't refetch per component.
 */
export function useCurrentWho(): string {
  const { authenticated } = useAuthStatus();
  const isAuthed = authenticated === true;
  const fetchName = useServerFn(getNameForCurrentIp);
  const [who, setWho] = useState<string>(() => cache ?? "anon");

  useEffect(() => {
    const cb = (v: string) => setWho(v);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);

  useEffect(() => {
    if (!isAuthed) {
      cache = "anon";
      setWho("anon");
      for (const cb of listeners) cb("anon");
      return;
    }
    try {
      const stored = typeof window !== "undefined" ? (localStorage.getItem("agenda_push_who") || "") : "";
      if (stored && stored !== "Alle") {
        cache = stored;
        setWho(stored);
        for (const cb of listeners) cb(stored);
        return;
      }
    } catch { /* ignore */ }
    let cancelled = false;
    fetchName()
      .then((r) => {
        if (cancelled) return;
        const next = r?.who || "anon";
        cache = next;
        setWho(next);
        for (const cb of listeners) cb(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthed, fetchName]);

  return who;
}

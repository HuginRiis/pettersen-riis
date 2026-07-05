import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LocationPicker, type ActiveLocation } from "@/components/LocationPicker";
import { useAuthStatus } from "@/hooks/use-auth-status";
import {
  getNameForCurrentIp,
  setDefaultLocation,
  type LocationPage,
  type WhoName,
} from "@/lib/user-locations.functions";

export type UserLocationState = {
  who: WhoName;
  active: ActiveLocation;
  defaultLoc: ActiveLocation;
  ready: boolean;
  authenticated: boolean;
};

/**
 * Hook som styrer "vakt" (Arne/Rebekka) og aktivt sted for en gitt side
 * ('var' | 'pollen').
 *
 * Prinsipp:
 *  - Ingen "Tollnes flash": SSR og første klient-render bruker samme
 *    fallback (fallback rendres skjult via `ready`-flagget på sidene).
 *    Etter mount leses siste valgte sted fra localStorage.
 *  - Ingen egen "Sett som standard"-knapp: hver gang brukeren bytter sted
 *    persisteres det i localStorage + speiles til `user_location_prefs`
 *    slik at f.eks. daglig-vær-push bruker samme sted som skjermen.
 */
export function useUserLocation(page: LocationPage): UserLocationState & {
  setWho: (who: WhoName) => void;
  setActive: (loc: ActiveLocation) => void;
  setDefaultLoc: (loc: ActiveLocation) => void;
} {
  const fetchName = useServerFn(getNameForCurrentIp);
  const saveDefault = useServerFn(setDefaultLocation);
  const { authenticated, loading: authLoading } = useAuthStatus();

  const fallback: ActiveLocation = {
    label: "Tollnes, Skien",
    lat: 59.2096,
    lon: 9.609,
  };

  const [who, setWho] = useState<WhoName>("Arne");
  const [active, setActive] = useState<ActiveLocation>(fallback);
  const [defaultLoc, setDefaultLoc] = useState<ActiveLocation>(fallback);
  const [ready, setReady] = useState(false);

  // Hvem eier IP-en? (Arne/Rebekka når innlogget, ellers 'Offentlig'.)
  useEffect(() => {
    if (authLoading) return;
    if (!authenticated) {
      setWho("Offentlig");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchName();
        if (cancelled) return;
        if (r.who) setWho(r.who);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchName, authenticated, authLoading]);

  // Etter mount: les siste valgte sted fra localStorage.
  // Ingen server-fetch — det unngår at Tollnes blinker forbi før
  // det ekte stedet vises.
  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(`loc:chosen:${page}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p.label === "string" && typeof p.lat === "number" && typeof p.lon === "number") {
          const loc: ActiveLocation = { label: p.label, lat: p.lat, lon: p.lon, source: p.source };
          setActive(loc);
          setDefaultLoc(loc);
        }
      }
      sessionStorage.removeItem(`loc:pending:${page}`);
    } catch {
      // ignore
    }
    setReady(true);
  }, [page]);

  const persistAndSetActive = (loc: ActiveLocation) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          `loc:chosen:${page}`,
          JSON.stringify({ label: loc.label, lat: loc.lat, lon: loc.lon, source: loc.source }),
        );
      } catch {
        // ignore
      }
    }
    setActive(loc);
    setDefaultLoc(loc);
    // Speil til DB slik at server-side push (daglig værmelding m.m.)
    // bruker samme sted som brukeren ser på skjermen. Best-effort;
    // feiler stille hvis IP ikke er tilgjengelig.
    void saveDefault({
      data: {
        who,
        page,
        place_label: loc.label,
        lat: loc.lat,
        lon: loc.lon,
      },
    }).catch(() => {});
  };

  return {
    who,
    active,
    defaultLoc,
    ready,
    authenticated: authenticated === true,
    setWho,
    setActive: persistAndSetActive,
    setDefaultLoc,
  };
}

/**
 * Render-helper som kombinerer hook + LocationPicker.
 */
export function UserLocationBar({
  page,
  state,
  readOnlyWho = false,
  transparent = false,
  hideActions = false,
  title,
}: {
  page: LocationPage;
  state: ReturnType<typeof useUserLocation>;
  readOnlyWho?: boolean;
  transparent?: boolean;
  hideActions?: boolean;
  title?: string;
}) {
  return (
    <LocationPicker
      page={page}
      who={state.who}
      onWhoChange={state.setWho}
      active={state.active}
      defaultLabel={state.defaultLoc.label}
      onChange={state.setActive}
      onDefaultSaved={(loc) => state.setDefaultLoc(loc)}
      authenticated={state.authenticated}
      readOnlyWho={readOnlyWho}
      transparent={transparent}
      hideActions={hideActions}
      title={title}
    />
  );
}

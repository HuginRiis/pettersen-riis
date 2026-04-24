import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LocationPicker, type ActiveLocation } from "@/components/LocationPicker";
import { useAuthStatus } from "@/hooks/use-auth-status";
import {
  getDefaultLocation,
  getNameForCurrentIp,
  type LocationPage,
  type WhoName,
} from "@/server/user-locations";

export type UserLocationState = {
  who: WhoName;
  active: ActiveLocation;
  defaultLoc: ActiveLocation;
  ready: boolean;
  authenticated: boolean;
};

/**
 * Hook som styrer "vakt" (Arne/Rebekka), default-sted og aktivt sted
 * for en gitt side ('var' | 'pollen').
 *
 * Atferd:
 * - Når brukeren IKKE er logget inn: Arne/Rebekka-systemet er skjult.
 *   Aktivt sted starter på Tollnes (fallback). Brukeren kan fortsatt søke
 *   og bytte sted lokalt, men kan ikke lagre default.
 * - Når brukeren ER logget inn: spør serveren hvilket navn som tilhører
 *   IP-en. Henter (who, IP, page)-default. Aktivt sted starter alltid på
 *   default — dvs. ved (re)mount havner man tilbake på sin egen default.
 */
export function useUserLocation(page: LocationPage): UserLocationState & {
  setWho: (who: WhoName) => void;
  setActive: (loc: ActiveLocation) => void;
  setDefaultLoc: (loc: ActiveLocation) => void;
} {
  const fetchName = useServerFn(getNameForCurrentIp);
  const fetchDefault = useServerFn(getDefaultLocation);
  const { authenticated, loading: authLoading } = useAuthStatus();

  const [who, setWho] = useState<WhoName>("Arne");
  const [active, setActive] = useState<ActiveLocation>({
    label: "Tollnes, Skien",
    lat: 59.2096,
    lon: 9.609,
  });
  const [defaultLoc, setDefaultLoc] = useState<ActiveLocation>({
    label: "Tollnes, Skien",
    lat: 59.2096,
    lon: 9.609,
  });
  const [ready, setReady] = useState(false);

  // Step 1: figure out who the IP belongs to — only when logged in
  useEffect(() => {
    if (authLoading) return;
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchName();
        if (cancelled) return;
        if (r.who) setWho(r.who);
      } catch {
        // ignore — keep default 'Arne'
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchName, authenticated, authLoading]);

  // Step 2: load default for this page. When logged in, scoped to (who, IP).
  // When logged out, no fetch — just use Tollnes fallback so the page is usable.
  useEffect(() => {
    if (authLoading) return;
    if (!authenticated) {
      // Logged-out visitors get Tollnes only — no IP/who lookup.
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchDefault({ data: { who, page } });
        if (cancelled) return;
        const loc = { label: r.place_label, lat: r.lat, lon: r.lon };
        setDefaultLoc(loc);
        setActive(loc); // alltid start på default ved (re)mount / bytte vakt
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [who, page, fetchDefault, authenticated, authLoading]);

  return {
    who,
    active,
    defaultLoc,
    ready,
    authenticated: authenticated === true,
    setWho,
    setActive,
    setDefaultLoc,
  };
}

/**
 * Render-helper som kombinerer hook + LocationPicker.
 * Brukes øverst på Vær- og Pollen-sidene.
 */
export function UserLocationBar({
  page,
  state,
}: {
  page: LocationPage;
  state: ReturnType<typeof useUserLocation>;
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
    />
  );
}

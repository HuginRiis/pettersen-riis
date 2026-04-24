import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LocationPicker, type ActiveLocation } from "@/components/LocationPicker";
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
};

/**
 * Hook som styrer "vakt" (Arne/Rebekka), default-sted og aktivt sted
 * for en gitt side ('var' | 'pollen').
 *
 * Atferd:
 * - Ved første mount: spør serveren hvilket navn som tilhører IP-en (hvis noen).
 *   Hvis ukjent, bruker "Arne" som start-vakt.
 * - Henter default-sted for (who, IP, page). Faller tilbake til Tollnes hvis ingen.
 * - Aktivt sted starter alltid på default — dvs. "etter navigering vekk og tilbake"
 *   ender man alltid på sin default igjen (siden hooken kjører ved mount).
 */
export function useUserLocation(page: LocationPage): UserLocationState & {
  setWho: (who: WhoName) => void;
  setActive: (loc: ActiveLocation) => void;
  setDefaultLoc: (loc: ActiveLocation) => void;
} {
  const fetchName = useServerFn(getNameForCurrentIp);
  const fetchDefault = useServerFn(getDefaultLocation);

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

  // Step 1: figure out who the IP belongs to
  useEffect(() => {
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
  }, [fetchName]);

  // Step 2: whenever 'who' changes, load that user's default for this page+IP
  useEffect(() => {
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
  }, [who, page, fetchDefault]);

  return { who, active, defaultLoc, ready, setWho, setActive, setDefaultLoc };
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
    />
  );
}

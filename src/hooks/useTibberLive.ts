import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTibberLiveSession, type TibberLiveSession } from "@/lib/tibber.functions";
import { recordPulseSample } from "@/server/pulse-readings";

export type TibberLiveReading = {
  timestamp: string; // ISO med tz
  power: number; // watt nå
  accumulatedConsumption: number; // kWh i dag
  accumulatedCost: number | null; // kr i dag (null uten abo)
  currency: string | null;
  minPower: number | null; // min siden midnatt
  maxPower: number | null; // max siden midnatt
  averagePower: number | null;
  receivedAt: number; // ms epoch da klienten mottok
};

export type TibberLiveHomeState = {
  location: "hytta" | "tollnes";
  homeId: string;
  status: "idle" | "connecting" | "live" | "stale" | "error";
  reading: TibberLiveReading | null;
  error: string | null;
  lastReceivedAt: number | null;
};

export type TibberLiveState = {
  loading: boolean;
  session: TibberLiveSession | null;
  homes: Record<"hytta" | "tollnes", TibberLiveHomeState>;
};

const STALE_AFTER_MS = 15_000; // ingen data på 15s = stale

const emptyHome = (location: "hytta" | "tollnes"): TibberLiveHomeState => ({
  location,
  homeId: "",
  status: "idle",
  reading: null,
  error: null,
  lastReceivedAt: null,
});

/**
 * Åpner én WSS-forbindelse per Pulse-hjem mot Tibber sin
 * `liveMeasurement`-subscription. Returnerer state per hjem.
 */
export function useTibberLive(): TibberLiveState {
  const fetchSession = useServerFn(getTibberLiveSession);
  const recordSample = useServerFn(recordPulseSample);
  const [session, setSession] = useState<TibberLiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [homes, setHomes] = useState<TibberLiveState["homes"]>({
    hytta: emptyHome("hytta"),
    tollnes: emptyHome("tollnes"),
  });
  const socketsRef = useRef<Map<string, WebSocket>>(new Map());
  const retriesRef = useRef<Map<string, number>>(new Map());
  const closedByUsRef = useRef(false);
  const lastSavedAtRef = useRef<Map<string, number>>(new Map());

  // Hent session én gang ved mount
  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[tibber-live] session fetch failed", err);
        setSession({ ok: false, wsUrl: null, token: null, homes: [], error: String(err?.message ?? err) });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Åpne WS når session er klar
  useEffect(() => {
    if (!session || !session.ok || !session.wsUrl || !session.token) return;
    closedByUsRef.current = false;
    const wsUrl = session.wsUrl;
    const token = session.token;

    const open = (homeId: string, location: "hytta" | "tollnes") => {
      setHomes((prev) => ({
        ...prev,
        [location]: { ...prev[location], homeId, status: "connecting", error: null },
      }));

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl, "graphql-transport-ws");
      } catch (err: any) {
        setHomes((prev) => ({
          ...prev,
          [location]: { ...prev[location], status: "error", error: err?.message ?? "WS feil" },
        }));
        return;
      }
      socketsRef.current.set(location, ws);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "connection_init", payload: { token } }));
      };

      ws.onmessage = (ev) => {
        let m: any;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.type === "connection_ack") {
          ws.send(
            JSON.stringify({
              id: "1",
              type: "subscribe",
              payload: {
                query: `subscription { liveMeasurement(homeId: "${homeId}") { timestamp power accumulatedConsumption accumulatedCost currency minPower maxPower averagePower } }`,
              },
            }),
          );
        } else if (m.type === "next" && m.payload?.data?.liveMeasurement) {
          const lm = m.payload.data.liveMeasurement;
          const reading: TibberLiveReading = {
            timestamp: lm.timestamp,
            power: typeof lm.power === "number" ? lm.power : 0,
            accumulatedConsumption: typeof lm.accumulatedConsumption === "number" ? lm.accumulatedConsumption : 0,
            accumulatedCost: typeof lm.accumulatedCost === "number" ? lm.accumulatedCost : null,
            currency: lm.currency ?? null,
            minPower: typeof lm.minPower === "number" ? lm.minPower : null,
            maxPower: typeof lm.maxPower === "number" ? lm.maxPower : null,
            averagePower: typeof lm.averagePower === "number" ? lm.averagePower : null,
            receivedAt: Date.now(),
          };
          retriesRef.current.set(location, 0);
          setHomes((prev) => ({
            ...prev,
            [location]: {
              ...prev[location],
              status: "live",
              reading,
              error: null,
              lastReceivedAt: reading.receivedAt,
            },
          }));
          // Throttled persist: maks 1 sample/min per hjem
          const lastSaved = lastSavedAtRef.current.get(location) ?? 0;
          if (reading.receivedAt - lastSaved > 60_000) {
            lastSavedAtRef.current.set(location, reading.receivedAt);
            recordSample({
              data: {
                location,
                watt: reading.power,
                kwh_today: reading.accumulatedConsumption,
              },
            }).catch((err) => console.warn("[tibber-live] save failed", err));
          }
        } else if (m.type === "error" || m.type === "connection_error") {
          const msg = JSON.stringify(m.payload ?? m).slice(0, 200);
          setHomes((prev) => ({
            ...prev,
            [location]: { ...prev[location], status: "error", error: msg },
          }));
        }
      };

      ws.onerror = () => {
        setHomes((prev) => ({
          ...prev,
          [location]: { ...prev[location], status: "error", error: prev[location].error ?? "WS-feil" },
        }));
      };

      ws.onclose = () => {
        socketsRef.current.delete(location);
        if (closedByUsRef.current) return;
        // exponential backoff: 2s, 4s, 8s, max 30s
        const tries = (retriesRef.current.get(location) ?? 0) + 1;
        retriesRef.current.set(location, tries);
        const delay = Math.min(30_000, 2_000 * 2 ** Math.min(tries - 1, 4));
        setHomes((prev) => ({
          ...prev,
          [location]: { ...prev[location], status: "connecting" },
        }));
        setTimeout(() => {
          if (!closedByUsRef.current) open(homeId, location);
        }, delay);
      };
    };

    for (const h of session.homes) {
      if (!h.hasPulse) continue;
      open(h.homeId, h.location);
    }

    return () => {
      closedByUsRef.current = true;
      for (const ws of socketsRef.current.values()) {
        try {
          ws.close();
        } catch {}
      }
      socketsRef.current.clear();
    };
  }, [session]);

  // Stale-detector: marker som "stale" hvis ingen oppdatering på 15s
  useEffect(() => {
    const id = setInterval(() => {
      setHomes((prev) => {
        const now = Date.now();
        let changed = false;
        const next = { ...prev };
        for (const loc of ["hytta", "tollnes"] as const) {
          const h = prev[loc];
          if (h.status === "live" && h.lastReceivedAt && now - h.lastReceivedAt > STALE_AFTER_MS) {
            next[loc] = { ...h, status: "stale" };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  return { loading, session, homes };
}

import { useEffect, useRef, useState } from "react";

type Measurement = {
  timestamp: string;
  power: number | null;
  accumulatedConsumption: number | null;
  accumulatedCost: number | null;
  currency: string | null;
  minPower: number | null;
  maxPower: number | null;
  averagePower: number | null;
};

/**
 * Sanntidspanel for Tibber Pulse.
 *
 * Tibber-kontoen vår har Pulse aktivt på begge målere, men ikke et aktivt
 * strømabonnement koblet til selve målepunktet — derfor leverer Tibber
 * ingen historisk forbruksgraf. Vi viser i stedet sanntidsverdiene som
 * Pulse strømmer over GraphQL-subscription:
 *   - watt akkurat nå
 *   - kWh så langt i dag
 *   - min/maks watt og snittwatt
 */
export function TibberLivePanel({
  location,
  title,
  subtitle,
}: {
  location: "hytta" | "tollnes";
  title: string;
  subtitle?: string;
}) {
  const [data, setData] = useState<Measurement | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      try {
        es = new EventSource(`/api/tibber/live?location=${location}`);
      } catch (e: any) {
        setError(e?.message ?? "EventSource feilet");
        return;
      }

      es.addEventListener("ready", () => {
        if (cancelled) return;
        setConnected(true);
        setError(null);
        retryRef.current = 0;
      });

      es.addEventListener("measurement", (ev) => {
        if (cancelled) return;
        try {
          const m = JSON.parse((ev as MessageEvent).data) as Measurement;
          setData(m);
          setUpdated(new Date());
          setError(null);
        } catch {
          /* ignore */
        }
      });

      es.addEventListener("error", (ev: Event) => {
        if (cancelled) return;
        const msg = (ev as MessageEvent).data;
        if (typeof msg === "string") {
          try {
            const parsed = JSON.parse(msg);
            if (parsed?.message) setError(parsed.message);
          } catch {
            /* ignore */
          }
        }
        setConnected(false);
        // Lukk og prøv igjen med backoff (maks 30 s).
        try {
          es?.close();
        } catch {
          /* ignore */
        }
        es = null;
        const delay = Math.min(30_000, 2_000 * 2 ** retryRef.current);
        retryRef.current = Math.min(retryRef.current + 1, 5);
        retryTimer = setTimeout(connect, delay);
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        es?.close();
      } catch {
        /* ignore */
      }
    };
  }, [location]);

  const watt = data?.power != null ? Math.round(data.power) : null;
  const kwhToday =
    data?.accumulatedConsumption != null
      ? Math.round(data.accumulatedConsumption * 100) / 100
      : null;
  const costToday =
    data?.accumulatedCost != null ? Math.round(data.accumulatedCost * 100) / 100 : null;
  const currency = data?.currency ?? "NOK";
  const minW = data?.minPower != null ? Math.round(data.minPower) : null;
  const maxW = data?.maxPower != null ? Math.round(data.maxPower) : null;
  const avgW = data?.averagePower != null ? Math.round(data.averagePower) : null;

  const updatedLabel = updated
    ? updated.toLocaleTimeString("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <article className="panel rounded-lg p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-primary">{title}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40"
            }`}
          />
          {connected ? "Live" : "Kobler…"}
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-destructive mb-3">{error}</div>
      )}

      {/* Watt akkurat nå */}
      <div className="rounded-md border border-border/40 bg-background/40 p-5 text-center">
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Akkurat nå
        </div>
        <div className="text-5xl sm:text-6xl font-semibold text-primary tabular-nums mt-2">
          {watt != null ? watt.toLocaleString("nb-NO") : "—"}
          <span className="text-2xl text-muted-foreground ml-1">W</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          Tibber Pulse · oppdatert {updatedLabel}
        </div>
      </div>

      {/* Min / snitt / maks siste minutt */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <MiniStat label="Min" value={minW != null ? `${minW} W` : "—"} />
        <MiniStat label="Snitt" value={avgW != null ? `${avgW} W` : "—"} />
        <MiniStat label="Maks" value={maxW != null ? `${maxW} W` : "—"} />
      </div>

      {/* I dag */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <MiniStat
          label="kWh i dag"
          value={kwhToday != null ? `${kwhToday.toFixed(2)} kWh` : "—"}
        />
        <MiniStat
          label="Kostnad i dag"
          value={
            costToday != null ? `${costToday.toFixed(2)} ${currency}` : "—"
          }
        />
      </div>

      <p className="text-[10px] text-muted-foreground/60 mt-3 leading-snug">
        Tibber leverer ikke historisk timesgraf for denne måleren (intet aktivt
        strømabonnement på Tibber-kontoen) — Pulse-sanntid er det som er
        tilgjengelig.
      </p>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/30 bg-background/30 p-2.5 text-center">
      <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground tabular-nums mt-1">
        {value}
      </div>
    </div>
  );
}

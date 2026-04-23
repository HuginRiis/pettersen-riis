import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Thermometer, Minus, Plus } from "lucide-react";
import {
  getHomeySnapshot,
  setLivingRoomDeviceCapability,
  type HomeyDeviceSnapshot,
  type HomeyZone,
} from "@/server/homey";
import { recordHomeyApiCall } from "@/lib/homey-api-tracker";
import { Slider } from "@/components/ui/slider";

// Skånsom polling — gjenbruker samme cache-vindu som Smarthus (3 min server-side).
const REFRESH_MS = 3 * 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;

export type HeaterLocation = "hytta" | "borg";

type HeaterDevice = {
  id: string;
  name: string;
  zoneName: string;
  onoff?: boolean;
  target?: number;
  measure?: number;
  min: number;
  max: number;
  step: number;
};

type State =
  | { status: "loading" }
  | { status: "ok"; heaters: HeaterDevice[] }
  | { status: "error"; message: string };

function isHyttaZone(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("hytt");
}

function buildHeaters(
  devices: HomeyDeviceSnapshot[],
  zones: HomeyZone[],
  location: HeaterLocation,
): HeaterDevice[] {
  const zoneById = new Map(zones.map((z) => [z.id, z.name]));
  const out: HeaterDevice[] = [];
  for (const d of devices) {
    const tt = d.capabilities["target_temperature"]?.value;
    if (typeof tt !== "number") continue;
    const zoneName = d.zone ? zoneById.get(d.zone) ?? "" : "";
    const combined = `${d.name} ${zoneName}`.toLowerCase();
    const belongsToHytta = isHyttaZone(zoneName) || combined.includes("hytt");
    if (location === "hytta" && !belongsToHytta) continue;
    if (location === "borg" && belongsToHytta) continue;

    const onoffVal = d.capabilities["onoff"]?.value;
    const measureVal = d.capabilities["measure_temperature"]?.value;

    out.push({
      id: d.id,
      name: d.name,
      zoneName: zoneName || "Ukjent sal",
      onoff: typeof onoffVal === "boolean" ? onoffVal : undefined,
      target: tt,
      measure: typeof measureVal === "number" ? measureVal : undefined,
      // Snapshot eksponerer ikke min/max/step — bruk fornuftige defaults.
      min: 5,
      max: 30,
      step: 0.5,
    });
  }
  out.sort((a, b) => {
    const z = a.zoneName.localeCompare(b.zoneName, "nb");
    if (z !== 0) return z;
    return a.name.localeCompare(b.name, "nb");
  });
  return out;
}

export function HeatersPanel({
  location,
  title,
  emptyHint,
}: {
  location: HeaterLocation;
  title: string;
  emptyHint?: string;
}) {
  const fetchSnapshot = useServerFn(getHomeySnapshot);
  const setCap = useServerFn(setLivingRoomDeviceCapability);

  const [state, setState] = useState<State>({ status: "loading" });
  const [overrides, setOverrides] = useState<
    Record<string, { onoff?: boolean; target?: number }>
  >({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const inFlight = useRef(false);
  const backoffRef = useRef<number>(REFRESH_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleNext = useCallback((delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void load();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) {
      scheduleNext(60_000);
      return;
    }
    inFlight.current = true;
    try {
      const snap = await fetchSnapshot();
      recordHomeyApiCall();
      if (snap.ok) {
        backoffRef.current = REFRESH_MS;
        const heaters = buildHeaters(snap.devices, snap.zones, location);
        setState({ status: "ok", heaters });
        // Tøm overrides som er bekreftet
        setOverrides((prev) => {
          const next = { ...prev };
          for (const h of heaters) {
            const o = next[h.id];
            if (!o) continue;
            const remaining: { onoff?: boolean; target?: number } = {};
            if (o.onoff !== undefined && o.onoff !== h.onoff) remaining.onoff = o.onoff;
            if (o.target !== undefined && o.target !== h.target) remaining.target = o.target;
            if (Object.keys(remaining).length === 0) delete next[h.id];
            else next[h.id] = remaining;
          }
          return next;
        });
        scheduleNext(REFRESH_MS);
      } else {
        const message = "needsConnect" in snap && snap.needsConnect
          ? "Homey er ikke tilkoblet."
          : (snap as any).error ?? "Klarte ikke hente Homey-data";
        const is429 = /429|rate-limit|too_many/i.test(message);
        if (is429) {
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        }
        setState((prev) =>
          prev.status === "ok" ? prev : { status: "error", message },
        );
        scheduleNext(is429 ? backoffRef.current : REFRESH_MS);
      }
    } catch (e: any) {
      setState((prev) =>
        prev.status === "ok"
          ? prev
          : { status: "error", message: e?.message ?? "Ukjent feil" },
      );
      scheduleNext(REFRESH_MS);
    } finally {
      inFlight.current = false;
    }
  }, [fetchSnapshot, location, scheduleNext]);

  useEffect(() => {
    void load();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  const sendCap = useCallback(
    async (
      heaterId: string,
      capability: "onoff" | "target_temperature",
      value: boolean | number,
    ) => {
      const key = `${heaterId}:${capability}`;
      if (busy[key]) return;
      setBusy((b) => ({ ...b, [key]: true }));
      setOverrides((o) => ({
        ...o,
        [heaterId]: {
          ...(o[heaterId] ?? {}),
          [capability === "onoff" ? "onoff" : "target"]: value,
        },
      }));
      try {
        const res = await setCap({
          data: { deviceId: heaterId, capability, value },
        });
        recordHomeyApiCall();
        if (!res.ok) {
          // rull tilbake override
          setOverrides((o) => {
            const next = { ...o };
            const cur = next[heaterId];
            if (cur) {
              if (capability === "onoff") delete cur.onoff;
              else delete cur.target;
              if (Object.keys(cur).length === 0) delete next[heaterId];
            }
            return next;
          });
        } else {
          scheduleNext(2_000);
        }
      } finally {
        setBusy((b) => {
          const { [key]: _drop, ...rest } = b;
          return rest;
        });
      }
    },
    [busy, setCap, scheduleNext],
  );

  const heaters = useMemo(() => {
    if (state.status !== "ok") return [] as HeaterDevice[];
    return state.heaters.map((h) => {
      const o = overrides[h.id];
      return o ? { ...h, ...o, target: o.target ?? h.target, onoff: o.onoff ?? h.onoff } : h;
    });
  }, [state, overrides]);

  // Grupper per sone for ryddig visning
  const grouped = useMemo(() => {
    const map = new Map<string, HeaterDevice[]>();
    for (const h of heaters) {
      const arr = map.get(h.zoneName) ?? [];
      arr.push(h);
      map.set(h.zoneName, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "nb"));
  }, [heaters]);

  return (
    <section className="container mx-auto px-4 py-12">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          {title}
        </span>
      </div>

      {state.status === "loading" && (
        <div className="panel rounded-lg p-8 flex items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      )}

      {state.status === "error" && (
        <div className="panel rounded-lg p-6">
          <p className="text-sm text-destructive">{state.message}</p>
        </div>
      )}

      {state.status === "ok" && heaters.length === 0 && (
        <div className="panel rounded-lg p-6">
          <p className="text-sm text-muted-foreground italic">
            {emptyHint ?? "Ingen varmeovner funnet i Homey for denne lokasjonen."}
          </p>
        </div>
      )}

      {state.status === "ok" && heaters.length > 0 && (
        <div className="space-y-8">
          {grouped.map(([zone, list]) => (
            <div key={zone}>
              <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-3">
                {zone}
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((h) => (
                  <HeaterCard
                    key={h.id}
                    heater={h}
                    busy={busy}
                    onSetTemp={(v) => sendCap(h.id, "target_temperature", v)}
                    onToggle={(v) => sendCap(h.id, "onoff", v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HeaterCard({
  heater,
  busy,
  onSetTemp,
  onToggle,
}: {
  heater: HeaterDevice;
  busy: Record<string, boolean>;
  onSetTemp: (v: number) => void;
  onToggle: (v: boolean) => void;
}) {
  const accent = "var(--gold)";
  const tempBusy = busy[`${heater.id}:target_temperature`];
  const onoffBusy = busy[`${heater.id}:onoff`];
  const isOn = heater.onoff !== false;

  const adjust = (delta: number) => {
    const cur = heater.target ?? 21;
    const next = Math.min(heater.max, Math.max(heater.min, +(cur + delta).toFixed(1)));
    if (next === cur) return;
    onSetTemp(next);
  };

  return (
    <article className="panel rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span
          className="text-display tracking-[0.3em] text-primary text-[10px] uppercase truncate"
          title={heater.name}
        >
          {heater.name}
        </span>
        <span className="text-[9px] tracking-[0.25em] text-muted-foreground/70 uppercase shrink-0 ml-2">
          Ovn
        </span>
      </div>
      <div className="flex-1 p-4 flex flex-col items-center justify-center gap-3">
        <Thermometer size={18} style={{ color: accent }} />

        <div
          className="text-display leading-none tabular-nums"
          style={{ color: accent, fontSize: "clamp(2rem, 6vw, 3.5rem)" }}
        >
          {(heater.target ?? 0).toFixed(1)}°
        </div>

        {heater.measure !== undefined && (
          <div className="text-[10px] tracking-[0.25em] text-muted-foreground/80 uppercase">
            Måler {heater.measure.toFixed(1)}° nå
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 w-full max-w-[260px] mt-1">
          <button
            type="button"
            onClick={() => adjust(-heater.step)}
            disabled={tempBusy || (heater.target ?? 0) <= heater.min}
            aria-label="Senk temperatur"
            className="rounded py-2.5 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{
              background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
              border: `1px solid color-mix(in oklab, ${accent} 30%, transparent)`,
              color: accent,
            }}
          >
            <Minus size={18} />
          </button>
          <div className="flex items-center justify-center text-[9px] tracking-[0.25em] uppercase text-muted-foreground">
            {tempBusy ? <Loader2 size={14} className="animate-spin" /> : `${heater.step}°`}
          </div>
          <button
            type="button"
            onClick={() => adjust(heater.step)}
            disabled={tempBusy || (heater.target ?? 0) >= heater.max}
            aria-label="Hev temperatur"
            className="rounded py-2.5 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{
              background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
              border: `1px solid color-mix(in oklab, ${accent} 30%, transparent)`,
              color: accent,
            }}
          >
            <Plus size={18} />
          </button>
        </div>

        {heater.onoff !== undefined && (
          <button
            type="button"
            onClick={() => onToggle(!isOn)}
            disabled={onoffBusy}
            className="rounded px-4 py-1.5 text-[10px] tracking-[0.3em] uppercase font-semibold transition-all disabled:opacity-50"
            style={{
              background: isOn
                ? `color-mix(in oklab, ${accent} 22%, transparent)`
                : "color-mix(in oklab, var(--foreground) 6%, transparent)",
              border: `1px solid color-mix(in oklab, ${accent} ${isOn ? 50 : 22}%, transparent)`,
              color: isOn ? accent : "var(--muted-foreground)",
            }}
          >
            {onoffBusy ? "…" : isOn ? "På" : "Av"}
          </button>
        )}
      </div>
    </article>
  );
}

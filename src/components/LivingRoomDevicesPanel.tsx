import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lightbulb, Thermometer, Minus, Plus } from "lucide-react";
import {
  getLivingRoomDevices,
  setLivingRoomDeviceCapability,
  type LivingRoomDevice,
} from "@/server/homey";

const REFRESH_MS = 60_000; // 1 min

type State =
  | { status: "loading" }
  | { status: "ok"; devices: LivingRoomDevice[] }
  | { status: "error"; message: string };

type Kind = "heatpump" | "ceiling";

function matchKind(d: LivingRoomDevice): Kind | null {
  const n = d.name.toLowerCase();
  // Varmepumpe: har target_temperature
  if (d.capabilities.target_temperature !== undefined) {
    if (
      n.includes("varmepump") ||
      n.includes("heat") ||
      n.includes("pump") ||
      n.includes("aircon") ||
      n.includes("ac")
    ) {
      return "heatpump";
    }
    // Fallback: enhver thermostat i stua antas å være varmepumpa
    return "heatpump";
  }
  // Taklampe EYCR-201
  if (d.capabilities.dim !== undefined) {
    if (
      n.includes("eycr") ||
      n.includes("201") ||
      n.includes("taklys") ||
      n.includes("taklamp") ||
      n.includes("ceiling")
    ) {
      return "ceiling";
    }
  }
  return null;
}

function useLivingRoomState() {
  const fetchDevices = useServerFn(getLivingRoomDevices);
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [state, setState] = useState<State>({ status: "loading" });
  const [overrides, setOverrides] = useState<
    Record<string, Partial<LivingRoomDevice["capabilities"]>>
  >({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const inFlight = useRef(false);

  const load = async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inFlight.current = true;
    try {
      const res = await fetchDevices();
      if (res.ok) {
        setState({ status: "ok", devices: res.devices });
        setOverrides((prev) => {
          const next = { ...prev };
          for (const d of res.devices) {
            const o = next[d.id];
            if (!o) continue;
            const remaining: any = {};
            for (const [k, v] of Object.entries(o)) {
              if ((d.capabilities as any)[k] !== v) remaining[k] = v;
            }
            if (Object.keys(remaining).length === 0) delete next[d.id];
            else next[d.id] = remaining;
          }
          return next;
        });
      } else {
        setState((prev) =>
          prev.status === "ok" ? prev : { status: "error", message: res.error },
        );
      }
    } catch (e: any) {
      setState((prev) =>
        prev.status === "ok"
          ? prev
          : { status: "error", message: e?.message ?? "Ukjent feil" },
      );
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    const onVis = () => {
      if (typeof document !== "undefined" && !document.hidden) load();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCap = async (
    device: LivingRoomDevice,
    capability: "onoff" | "target_temperature" | "dim",
    value: boolean | number,
  ) => {
    const key = `${device.id}:${capability}`;
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setOverrides((o) => ({
      ...o,
      [device.id]: { ...(o[device.id] ?? {}), [capability]: value },
    }));
    try {
      const res = await setCap({ data: { deviceId: device.id, capability, value } });
      if (!res.ok) {
        setOverrides((o) => {
          const next = { ...o };
          if (next[device.id]) {
            const { [capability]: _drop, ...rest } = next[device.id]!;
            if (Object.keys(rest).length === 0) delete next[device.id];
            else next[device.id] = rest;
          }
          return next;
        });
      } else {
        setTimeout(load, 800);
      }
    } catch {
      setOverrides((o) => {
        const next = { ...o };
        if (next[device.id]) {
          const { [capability]: _drop, ...rest } = next[device.id]!;
          if (Object.keys(rest).length === 0) delete next[device.id];
          else next[device.id] = rest;
        }
        return next;
      });
    } finally {
      setBusy((b) => {
        const { [key]: _drop, ...rest } = b;
        return rest;
      });
    }
  };

  const findByKind = (kind: Kind): LivingRoomDevice | null => {
    if (state.status !== "ok") return null;
    // Eksakte navne-treff først
    if (kind === "ceiling") {
      const eycr = state.devices.find(
        (d) =>
          d.capabilities.dim !== undefined &&
          (d.name.toLowerCase().includes("eycr") ||
            d.name.toLowerCase().includes("201")),
      );
      if (eycr) return eycr;
    }
    return state.devices.find((d) => matchKind(d) === kind) ?? null;
  };

  return { state, overrides, busy, sendCap, findByKind };
}

export function HeatPumpTile() {
  const { state, overrides, busy, sendCap, findByKind } = useLivingRoomState();
  const device = findByKind("heatpump");
  const accent = "var(--ice)";

  return (
    <article className="panel rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-display tracking-[0.3em] text-primary text-[10px] sm:text-xs uppercase">
          Varmepumpe · Stua
        </span>
        <span className="text-[9px] tracking-[0.25em] text-muted-foreground/70 uppercase">
          Homey
        </span>
      </div>
      <div className="flex-1 p-4 flex flex-col items-center justify-center">
        {state.status === "loading" && (
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        )}
        {state.status === "error" && (
          <div className="text-center text-sm text-destructive">{state.message}</div>
        )}
        {state.status === "ok" && !device && (
          <div className="text-center text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
            Fant ikke varmepumpe
          </div>
        )}
        {device && (
          <ThermostatBody
            device={device}
            override={overrides[device.id]}
            busy={busy}
            accent={accent}
            onSetTemp={(v) => sendCap(device, "target_temperature", v)}
            onToggle={(v) => sendCap(device, "onoff", v)}
          />
        )}
      </div>
    </article>
  );
}

export function CeilingLampTile() {
  const { state, overrides, busy, sendCap, findByKind } = useLivingRoomState();
  const device = findByKind("ceiling");
  const accent = "var(--gold)";

  return (
    <article className="panel rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-display tracking-[0.3em] text-primary text-[10px] sm:text-xs uppercase">
          Taklampe · Stua
        </span>
        <span className="text-[9px] tracking-[0.25em] text-muted-foreground/70 uppercase">
          EYCR-201
        </span>
      </div>
      <div className="flex-1 p-4 flex flex-col items-center justify-center">
        {state.status === "loading" && (
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        )}
        {state.status === "error" && (
          <div className="text-center text-sm text-destructive">{state.message}</div>
        )}
        {state.status === "ok" && !device && (
          <div className="text-center text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
            Fant ikke EYCR-201
          </div>
        )}
        {device && (
          <DimmerBody
            device={device}
            override={overrides[device.id]}
            busy={busy}
            accent={accent}
            onSetDim={(v) => sendCap(device, "dim", v)}
            onToggle={(v) => sendCap(device, "onoff", v)}
          />
        )}
      </div>
    </article>
  );
}

function ThermostatBody({
  device,
  override,
  busy,
  accent,
  onSetTemp,
  onToggle,
}: {
  device: LivingRoomDevice;
  override?: Partial<LivingRoomDevice["capabilities"]>;
  busy: Record<string, boolean>;
  accent: string;
  onSetTemp: (v: number) => void;
  onToggle: (v: boolean) => void;
}) {
  const caps = { ...device.capabilities, ...(override ?? {}) };
  const min = device.capabilities.target_temperature_min ?? 16;
  const max = device.capabilities.target_temperature_max ?? 30;
  const step = device.capabilities.target_temperature_step ?? 0.5;
  const tempBusy = busy[`${device.id}:target_temperature`];
  const onoffBusy = busy[`${device.id}:onoff`];
  const isOn = caps.onoff !== false;

  const adjust = (delta: number) => {
    const cur = caps.target_temperature ?? 21;
    const next = Math.min(max, Math.max(min, +(cur + delta).toFixed(1)));
    if (next === cur) return;
    onSetTemp(next);
  };

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <Thermometer size={18} style={{ color: accent }} />
        <div
          className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground truncate max-w-[200px]"
          title={device.name}
        >
          {device.name}
        </div>
      </div>

      <div
        className="text-display leading-none tabular-nums"
        style={{ color: accent, fontSize: "clamp(2.5rem, 8vw, 4.5rem)" }}
      >
        {(caps.target_temperature ?? 0).toFixed(1)}°
      </div>

      {caps.measure_temperature !== undefined && (
        <div className="text-[10px] tracking-[0.25em] text-muted-foreground/80 uppercase">
          Måler {caps.measure_temperature.toFixed(1)}° nå
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 w-full max-w-[280px] mt-1">
        <button
          type="button"
          onClick={() => adjust(-step)}
          disabled={tempBusy || (caps.target_temperature ?? 0) <= min}
          aria-label="Senk temperatur"
          className="rounded py-3 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          style={{
            background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
            border: `1px solid color-mix(in oklab, ${accent} 30%, transparent)`,
            color: accent,
          }}
        >
          <Minus size={20} />
        </button>
        <div className="flex items-center justify-center text-[9px] tracking-[0.25em] uppercase text-muted-foreground">
          {tempBusy ? <Loader2 size={14} className="animate-spin" /> : `${step}°`}
        </div>
        <button
          type="button"
          onClick={() => adjust(step)}
          disabled={tempBusy || (caps.target_temperature ?? 0) >= max}
          aria-label="Hev temperatur"
          className="rounded py-3 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          style={{
            background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
            border: `1px solid color-mix(in oklab, ${accent} 30%, transparent)`,
            color: accent,
          }}
        >
          <Plus size={20} />
        </button>
      </div>

      {caps.onoff !== undefined && (
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
  );
}

function DimmerBody({
  device,
  override,
  busy,
  accent,
  onSetDim,
  onToggle,
}: {
  device: LivingRoomDevice;
  override?: Partial<LivingRoomDevice["capabilities"]>;
  busy: Record<string, boolean>;
  accent: string;
  onSetDim: (v: number) => void;
  onToggle: (v: boolean) => void;
}) {
  const caps = { ...device.capabilities, ...(override ?? {}) };
  const dim = caps.dim ?? 0; // 0..1
  const isOn = caps.onoff !== false && dim > 0;
  const dimBusy = busy[`${device.id}:dim`];
  const onoffBusy = busy[`${device.id}:onoff`];

  // Lokalt slider-state for jevn dragging — committer ved release
  const [local, setLocal] = useState<number | null>(null);
  const value = local ?? dim;
  const pct = Math.round(value * 100);

  // Reset lokalt state når serveren bekrefter ny verdi
  useEffect(() => {
    if (local !== null && Math.abs(local - dim) < 0.01) setLocal(null);
  }, [dim, local]);

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <Lightbulb
          size={18}
          style={{ color: isOn ? accent : "var(--muted-foreground)" }}
        />
        <div
          className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground truncate max-w-[200px]"
          title={device.name}
        >
          {device.name}
        </div>
      </div>

      <div
        className="text-display leading-none tabular-nums"
        style={{
          color: isOn ? accent : "var(--muted-foreground)",
          fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
        }}
      >
        {pct}%
      </div>

      <div className="text-[10px] tracking-[0.25em] text-muted-foreground/80 uppercase">
        {isOn ? "Tent" : "Slukket"}
      </div>

      <div className="w-full max-w-[280px] px-2">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => setLocal(Number(e.target.value) / 100)}
          onPointerUp={(e) => {
            const v = Number((e.target as HTMLInputElement).value) / 100;
            onSetDim(v);
          }}
          onTouchEnd={(e) => {
            const v = Number((e.target as HTMLInputElement).value) / 100;
            onSetDim(v);
          }}
          onKeyUp={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              const v = Number((e.target as HTMLInputElement).value) / 100;
              onSetDim(v);
            }
          }}
          disabled={dimBusy}
          aria-label="Lysstyrke"
          className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:opacity-50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--gold)] [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--gold)] [&::-moz-range-thumb]:border-0"
          style={{
            background: `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, color-mix(in oklab, var(--foreground) 12%, transparent) ${pct}%, color-mix(in oklab, var(--foreground) 12%, transparent) 100%)`,
          }}
        />
        <div className="flex justify-between text-[8px] tracking-[0.2em] uppercase text-muted-foreground/60 mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {caps.onoff !== undefined && (
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
  );
}

// Bakoverkompatibel eksport — viser begge tiles stablet (brukes ikke lenger på Steintavle).
export function LivingRoomDevicesPanel() {
  return (
    <div className="flex flex-col gap-3">
      <HeatPumpTile />
      <CeilingLampTile />
    </div>
  );
}

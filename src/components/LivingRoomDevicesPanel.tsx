import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lightbulb, LightbulbOff, Plug, Thermometer, Minus, Plus } from "lucide-react";
import {
  getLivingRoomDevices,
  setLivingRoomDeviceCapability,
  type LivingRoomDevice,
} from "@/server/homey";

const REFRESH_MS = 60_000; // 1 min — stua endrer seg ofte

type State =
  | { status: "loading" }
  | { status: "ok"; devices: LivingRoomDevice[] }
  | { status: "error"; message: string };

export function LivingRoomDevicesPanel() {
  const fetchDevices = useServerFn(getLivingRoomDevices);
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [state, setState] = useState<State>({ status: "loading" });
  // Optimistiske overstyringer per enhet — droppes når serveren bekrefter.
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
        // Slipp overrides som matcher serverens nye verdi
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
        // Rull tilbake
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
        // Hent fersk state etter en kort pause så Homey rekker å oppdatere
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

  return (
    <div className="panel rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-display tracking-[0.3em] text-primary text-[10px] sm:text-xs uppercase">
          Stuens hall · Enheter
        </span>
        <span className="text-[9px] tracking-[0.25em] text-muted-foreground/70 uppercase">
          {state.status === "ok" ? `${state.devices.length} enheter` : "Homey"}
        </span>
      </div>

      <div className="flex-1 p-3 sm:p-4">
        {state.status === "loading" && (
          <div className="text-center text-[11px] tracking-[0.3em] text-muted-foreground uppercase py-8">
            Sender ravn til stua…
          </div>
        )}
        {state.status === "error" && (
          <div className="text-center py-6">
            <div className="text-2xl mb-2">⚠</div>
            <div className="text-sm text-destructive">{state.message}</div>
          </div>
        )}
        {state.status === "ok" && state.devices.length === 0 && (
          <div className="text-center text-[11px] tracking-[0.3em] text-muted-foreground uppercase py-8">
            Ingen styrbare enheter funnet i stua
          </div>
        )}
        {state.status === "ok" && state.devices.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {state.devices.map((d) => (
              <DeviceTile
                key={d.id}
                device={d}
                override={overrides[d.id]}
                busy={busy}
                onToggle={(v) => sendCap(d, "onoff", v)}
                onSetTemp={(v) => sendCap(d, "target_temperature", v)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceTile({
  device,
  override,
  busy,
  onToggle,
  onSetTemp,
}: {
  device: LivingRoomDevice;
  override?: Partial<LivingRoomDevice["capabilities"]>;
  busy: Record<string, boolean>;
  onToggle: (v: boolean) => void;
  onSetTemp: (v: number) => void;
}) {
  const caps = { ...device.capabilities, ...(override ?? {}) };
  const isThermo = caps.target_temperature !== undefined;
  const onoffBusy = busy[`${device.id}:onoff`];
  const tempBusy = busy[`${device.id}:target_temperature`];

  const min = device.capabilities.target_temperature_min ?? 16;
  const max = device.capabilities.target_temperature_max ?? 30;
  const step = device.capabilities.target_temperature_step ?? 0.5;

  const isOn = caps.onoff === true;
  const accent = isThermo
    ? "var(--ice)"
    : isOn
      ? "var(--gold)"
      : "var(--muted-foreground)";

  const Icon = isThermo
    ? Thermometer
    : device.class === "socket"
      ? Plug
      : isOn
        ? Lightbulb
        : LightbulbOff;

  const adjustTemp = (delta: number) => {
    const cur = caps.target_temperature ?? 21;
    const next = Math.min(max, Math.max(min, +(cur + delta).toFixed(1)));
    if (next === cur) return;
    onSetTemp(next);
  };

  return (
    <article
      className="panel rounded-md p-2.5 flex flex-col text-center"
      style={
        isOn && !isThermo
          ? {
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 35%, transparent), 0 0 14px color-mix(in oklab, ${accent} 18%, transparent)`,
            }
          : isThermo
            ? {
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 25%, transparent)`,
              }
            : undefined
      }
    >
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon size={14} style={{ color: accent }} />
        <div
          className="text-[9px] tracking-[0.2em] uppercase truncate"
          style={{ color: "var(--foreground)" }}
          title={device.name}
        >
          {device.name}
        </div>
      </div>

      {isThermo ? (
        <>
          <div className="text-display leading-none my-1" style={{ color: accent }}>
            <span className="text-2xl sm:text-3xl tabular-nums">
              {(caps.target_temperature ?? 0).toFixed(1)}°
            </span>
          </div>
          {caps.measure_temperature !== undefined && (
            <div className="text-[9px] tracking-[0.2em] text-muted-foreground/80 uppercase">
              Nå {caps.measure_temperature.toFixed(1)}°
            </div>
          )}
          <div className="grid grid-cols-3 gap-1 mt-2">
            <button
              type="button"
              onClick={() => adjustTemp(-step)}
              disabled={tempBusy || (caps.target_temperature ?? 0) <= min}
              aria-label="Senk temperatur"
              className="rounded py-1.5 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
                border: `1px solid color-mix(in oklab, ${accent} 25%, transparent)`,
                color: accent,
              }}
            >
              <Minus size={14} />
            </button>
            <div className="flex items-center justify-center text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
              {tempBusy ? <Loader2 size={12} className="animate-spin" /> : "Sett"}
            </div>
            <button
              type="button"
              onClick={() => adjustTemp(step)}
              disabled={tempBusy || (caps.target_temperature ?? 0) >= max}
              aria-label="Hev temperatur"
              className="rounded py-1.5 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
                border: `1px solid color-mix(in oklab, ${accent} 25%, transparent)`,
                color: accent,
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          {caps.onoff !== undefined && (
            <button
              type="button"
              onClick={() => onToggle(!isOn)}
              disabled={onoffBusy}
              className="mt-2 rounded py-1 text-[9px] tracking-[0.25em] uppercase font-semibold transition-all disabled:opacity-50"
              style={{
                background: isOn
                  ? `color-mix(in oklab, ${accent} 20%, transparent)`
                  : "color-mix(in oklab, var(--foreground) 6%, transparent)",
                border: `1px solid color-mix(in oklab, ${accent} ${isOn ? 50 : 20}%, transparent)`,
                color: isOn ? accent : "var(--muted-foreground)",
              }}
            >
              {onoffBusy ? "…" : isOn ? "På" : "Av"}
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(!isOn)}
          disabled={onoffBusy || caps.onoff === undefined}
          className="mt-2 rounded py-2 text-[10px] tracking-[0.25em] uppercase font-semibold transition-all disabled:opacity-50"
          style={{
            background: isOn
              ? `color-mix(in oklab, ${accent} 25%, transparent)`
              : "color-mix(in oklab, var(--foreground) 6%, transparent)",
            border: `1px solid color-mix(in oklab, ${accent} ${isOn ? 55 : 22}%, transparent)`,
            color: isOn ? accent : "var(--muted-foreground)",
          }}
        >
          {onoffBusy ? (
            <Loader2 size={12} className="animate-spin inline" />
          ) : isOn ? (
            "Tent"
          ) : (
            "Slukket"
          )}
        </button>
      )}
    </article>
  );
}

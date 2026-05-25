import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Lightbulb,
  Thermometer,
  Minus,
  Plus,
  Sun,
  Snowflake,
  Wind,
  Droplets,
  RefreshCw,
  Power,
} from "lucide-react";
import {
  getLivingRoomDevices,
  setLivingRoomDeviceCapability,
  type LivingRoomDevice,
} from "@/server/homey";

// Skånsom polling for alltid-på iPad: 3 min normalt, dobles ved 429-feil.
const REFRESH_MS = 3 * 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;

type State =
  | { status: "loading" }
  | { status: "ok"; devices: LivingRoomDevice[] }
  | { status: "error"; message: string };

type Kind = "heatpump" | "ceiling";

function matchKind(d: LivingRoomDevice): Kind | null {
  const n = d.name.toLowerCase();
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
    return "heatpump";
  }
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

type Ctx = {
  state: State;
  overrides: Record<string, Partial<LivingRoomDevice["capabilities"]>>;
  busy: Record<string, boolean>;
  sendCap: (
    device: LivingRoomDevice,
    capability:
      | "onoff"
      | "target_temperature"
      | "dim"
      | "thermostat_mode"
      | (string & {}),
    value: boolean | number | string,
  ) => Promise<void>;
  findByKind: (kind: Kind) => LivingRoomDevice | null;
};

const LivingRoomCtx = createContext<Ctx | null>(null);

export function LivingRoomProvider({ children }: { children: ReactNode }) {
  const fetchDevices = useServerFn(getLivingRoomDevices);
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [state, setState] = useState<State>({ status: "loading" });
  const [overrides, setOverrides] = useState<
    Record<string, Partial<LivingRoomDevice["capabilities"]>>
  >({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const inFlight = useRef(false);
  // Eksponentiell backoff ved 429
  const backoffRef = useRef<number>(REFRESH_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleNext = useCallback((delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      load();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) {
      // Ikke poll når fanen er skjult — sjekk igjen om 1 min
      scheduleNext(60_000);
      return;
    }
    inFlight.current = true;
    try {
      const res = await fetchDevices();
      if (res.ok) {
        backoffRef.current = REFRESH_MS; // reset backoff
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
        scheduleNext(REFRESH_MS);
      } else {
        // Ved 429 / rate-limit: doble intervallet, maks 30 min
        const is429 = /429|rate-limit|too_many/i.test(res.error);
        if (is429) {
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        }
        setState((prev) =>
          prev.status === "ok" ? prev : { status: "error", message: res.error },
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
  }, [fetchDevices, scheduleNext]);

  useEffect(() => {
    load();
    const onVis = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        // Hent fersk når brukeren kommer tilbake — men maks én gang per 30s
        const since = backoffRef.current;
        if (since > 30_000) load();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [load]);

  const sendCap = useCallback(
    async (
      device: LivingRoomDevice,
      capability:
        | "onoff"
        | "target_temperature"
        | "dim"
        | "thermostat_mode"
        | (string & {}),
      value: boolean | number | string,
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
          // Hent ferskt etter en kort pause så Homey rekker å speile.
          // Bruker scheduleNext, ikke umiddelbar load — unngår å trigge 429.
          scheduleNext(2_000);
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
    },
    [busy, setCap, scheduleNext],
  );

  const findByKind = useCallback(
    (kind: Kind): LivingRoomDevice | null => {
      if (state.status !== "ok") return null;
      if (kind === "ceiling") {
        const eycr = state.devices.find(
          (d) =>
            d.capabilities.dim !== undefined &&
            (d.name.toLowerCase().includes("eycr") ||
              d.name.toLowerCase().includes("201")),
        );
        if (eycr) return eycr;
      }
      if (kind === "heatpump") {
        // Foretrekk Mitsubishi / MELCloud-varmepumpa i stua
        const mits = state.devices.find((d) => {
          if (d.capabilities.target_temperature === undefined) return false;
          const n = d.name.toLowerCase();
          return (
            n.includes("mitsubishi") ||
            n.includes("melcloud") ||
            n.includes("mel cloud") ||
            n.includes("mel-cloud")
          );
        });
        if (mits) return mits;
      }
      return state.devices.find((d) => matchKind(d) === kind) ?? null;
    },
    [state],
  );

  const value = useMemo<Ctx>(
    () => ({ state, overrides, busy, sendCap, findByKind }),
    [state, overrides, busy, sendCap, findByKind],
  );

  return <LivingRoomCtx.Provider value={value}>{children}</LivingRoomCtx.Provider>;
}

function useLivingRoom(): Ctx {
  const ctx = useContext(LivingRoomCtx);
  if (!ctx) {
    throw new Error("LivingRoom-tiles må wrappes i <LivingRoomProvider>");
  }
  return ctx;
}

const HEATPUMP_LS_KEY = "steintavle.heatpumpDeviceId";

export function HeatPumpTile() {
  const { state, overrides, busy, sendCap } = useLivingRoom();
  const accent = "var(--ice)";

  // Alle stua-enheter som har target_temperature (= varmepumper / termostater)
  const heatpumps =
    state.status === "ok"
      ? state.devices.filter(
          (d) => d.capabilities.target_temperature !== undefined,
        )
      : [];

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(HEATPUMP_LS_KEY);
  });

  // Velg automatisk: lagret valg → den som står på 22° → første
  const device =
    heatpumps.find((d) => d.id === selectedId) ??
    heatpumps.find(
      (d) =>
        typeof d.capabilities.target_temperature === "number" &&
        Math.round(d.capabilities.target_temperature) === 22,
    ) ??
    heatpumps[0] ??
    null;

  const pickDevice = (id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HEATPUMP_LS_KEY, id);
    }
  };

  return (
    <article className="panel rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-display tracking-[0.3em] text-primary text-[10px] sm:text-xs uppercase">
          Varmepumpe · Stua
        </span>
        {heatpumps.length > 1 && device && (
          <button
            type="button"
            onClick={() => {
              const idx = heatpumps.findIndex((d) => d.id === device.id);
              const next = heatpumps[(idx + 1) % heatpumps.length];
              pickDevice(next.id);
            }}
            className="text-[9px] tracking-[0.25em] text-muted-foreground/70 hover:text-primary uppercase"
            title="Bytt varmepumpe"
          >
            Bytt ({heatpumps.length})
          </button>
        )}
        {heatpumps.length <= 1 && (
          <span className="text-[9px] tracking-[0.25em] text-muted-foreground/70 uppercase">
            Homey
          </span>
        )}
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
            onSetMode={(v) => sendCap(device, "thermostat_mode", v)}
          />
        )}
      </div>
    </article>
  );
}

export function CeilingLampTile() {
  const { state, overrides, busy, sendCap, findByKind } = useLivingRoom();
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

// Mitsubishi / MELCloud / Z-wave-termostater rapporterer som regel disse
// modusene. Vi viser ikoner basert på id (case-insensitive substring-match).
const MODE_META: { match: RegExp; label: string; Icon: typeof Sun }[] = [
  { match: /auto/i, label: "Auto", Icon: RefreshCw },
  { match: /heat|varm/i, label: "Varme", Icon: Sun },
  { match: /cool|kjøl|kjol/i, label: "Kjøl", Icon: Snowflake },
  { match: /dry|tørk|tork/i, label: "Tørk", Icon: Droplets },
  { match: /fan|vift/i, label: "Vifte", Icon: Wind },
  { match: /off|av/i, label: "Av", Icon: Power },
];

function modeMeta(id: string, fallbackTitle?: string) {
  const hit = MODE_META.find((m) => m.match.test(id));
  return {
    label: hit?.label ?? fallbackTitle ?? id,
    Icon: hit?.Icon ?? RefreshCw,
  };
}

// Default-modi når Homey ikke gir oss capability-enum (typisk MELCloud).
const DEFAULT_MODES: { id: string; title?: string }[] = [
  { id: "auto" },
  { id: "heat" },
  { id: "cool" },
  { id: "dry" },
  { id: "fan" },
];

function ThermostatBody({
  device,
  override,
  busy,
  accent,
  onSetTemp,
  onToggle,
  onSetMode,
}: {
  device: LivingRoomDevice;
  override?: Partial<LivingRoomDevice["capabilities"]>;
  busy: Record<string, boolean>;
  accent: string;
  onSetTemp: (v: number) => void;
  onToggle: (v: boolean) => void;
  onSetMode: (v: string) => void;
}) {
  const caps = { ...device.capabilities, ...(override ?? {}) };
  const min = device.capabilities.target_temperature_min ?? 16;
  const max = device.capabilities.target_temperature_max ?? 30;
  const baseStep = device.capabilities.target_temperature_step ?? 0.5;
  const stepKey = `steintavle.heatpump.step.${device.id}`;
  const [userStep, setUserStep] = useState<0.5 | 1>(() => {
    if (typeof window === "undefined") return 0.5;
    return window.localStorage.getItem(stepKey) === "1" ? 1 : 0.5;
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(stepKey, String(userStep));
  }, [userStep, stepKey]);
  const step = Math.max(baseStep, userStep);
  const tempBusy = busy[`${device.id}:target_temperature`];
  const onoffBusy = busy[`${device.id}:onoff`];
  const modeBusy = busy[`${device.id}:thermostat_mode`];
  const isOn = caps.onoff !== false;
  const currentMode = caps.thermostat_mode;
  const supportsMode =
    currentMode !== undefined ||
    (device.capabilities.thermostat_mode_values?.length ?? 0) > 0;
  const modes =
    device.capabilities.thermostat_mode_values?.length
      ? device.capabilities.thermostat_mode_values
      : DEFAULT_MODES;

  const adjust = (delta: number) => {
    const cur = caps.target_temperature ?? 21;
    const next = Math.min(max, Math.max(min, +(cur + delta).toFixed(1)));
    if (next === cur) return;
    onSetTemp(next);
  };

  // Lokalt slider-state for jevn dragging — committer ved release
  const [localTemp, setLocalTemp] = useState<number | null>(null);
  const sliderValue = localTemp ?? caps.target_temperature ?? min;
  const sliderPct = Math.max(
    0,
    Math.min(100, ((sliderValue - min) / Math.max(0.0001, max - min)) * 100),
  );

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

      <div className="w-full max-w-[280px] mt-1 px-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={(e) => setLocalTemp(parseFloat(e.target.value))}
          onPointerUp={() => {
            if (localTemp !== null) {
              const v = +localTemp.toFixed(1);
              setLocalTemp(null);
              if (v !== caps.target_temperature) onSetTemp(v);
            }
          }}
          onPointerCancel={() => setLocalTemp(null)}
          onKeyUp={() => {
            if (localTemp !== null) {
              const v = +localTemp.toFixed(1);
              setLocalTemp(null);
              if (v !== caps.target_temperature) onSetTemp(v);
            }
          }}
          disabled={tempBusy}
          aria-label="Velg temperatur"
          className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:opacity-50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--thumb)] [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--thumb)] [&::-moz-range-thumb]:border-0"
          style={{
            background: `linear-gradient(to right, ${accent} 0%, ${accent} ${sliderPct}%, color-mix(in oklab, var(--foreground) 12%, transparent) ${sliderPct}%, color-mix(in oklab, var(--foreground) 12%, transparent) 100%)`,
            ["--thumb" as any]: accent,
          }}
        />
      </div>

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
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground">
            {tempBusy ? <Loader2 size={14} className="animate-spin" /> : `${step}°`}
          </div>
          <div
            role="group"
            aria-label="Velg steg"
            className="inline-flex rounded-full overflow-hidden text-[8px] tracking-[0.15em]"
            style={{ border: `1px solid color-mix(in oklab, ${accent} 24%, transparent)` }}
          >
            {([0.5, 1] as const).map((s) => {
              const active = userStep === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setUserStep(s)}
                  className="px-1.5 py-0.5 transition-colors"
                  style={{
                    background: active ? `color-mix(in oklab, ${accent} 22%, transparent)` : "transparent",
                    color: active ? accent : "var(--muted-foreground)",
                  }}
                >
                  {s}°
                </button>
              );
            })}
          </div>
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

      {supportsMode && (
        <div className="w-full max-w-[280px] mt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
              Modus
            </span>
            {modeBusy && (
              <Loader2 size={12} className="animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {modes.map((m) => {
              const meta = modeMeta(m.id, m.title);
              const active =
                currentMode !== undefined &&
                currentMode.toLowerCase() === m.id.toLowerCase();
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (active || modeBusy) return;
                    onSetMode(m.id);
                  }}
                  disabled={modeBusy}
                  aria-label={`Modus ${meta.label}`}
                  title={meta.label}
                  className="rounded py-2 flex flex-col items-center justify-center gap-0.5 transition-all disabled:opacity-50 active:scale-95"
                  style={{
                    background: active
                      ? `color-mix(in oklab, ${accent} 22%, transparent)`
                      : "color-mix(in oklab, var(--foreground) 6%, transparent)",
                    border: `1px solid color-mix(in oklab, ${accent} ${
                      active ? 55 : 18
                    }%, transparent)`,
                    color: active ? accent : "var(--muted-foreground)",
                  }}
                >
                  <meta.Icon size={14} />
                  <span className="text-[8px] tracking-[0.2em] uppercase">
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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

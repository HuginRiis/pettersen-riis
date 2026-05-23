import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Thermometer,
  Minus,
  Plus,
  ChevronDown,
  Flame,
  Sun,
  Snowflake,
  Wind,
  Droplets,
  RefreshCw,
  Power,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ArrowLeftRight,
  RotateCw,
  Maximize2,
  Move,
} from "lucide-react";
import {
  getHomeySnapshot,
  setLivingRoomDeviceCapability,
  type HomeyDeviceSnapshot,
  type HomeyZone,
  type HomeyCapabilityEnumValue,
} from "@/server/homey";
import { recordHomeyApiCall } from "@/lib/homey-api-tracker";

// Skånsom polling — gjenbruker samme cache-vindu som Smarthus (3 min server-side).
const REFRESH_MS = 3 * 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;

export type HeaterLocation = "hytta" | "borg";

type SwingControl = {
  capabilityId: string;
  label: string;
  kind: "boolean" | "enum";
  value?: boolean | string | number;
  values?: HomeyCapabilityEnumValue[];
};

type HeaterDevice = {
  id: string;
  name: string;
  zoneName: string;
  isQlima: boolean;
  onoff?: boolean;
  target?: number;
  measure?: number;
  min: number;
  max: number;
  step: number;
  hasTarget: boolean;
  thermostatMode?: string;
  thermostatModeValues?: HomeyCapabilityEnumValue[];
  fanCapabilityId?: string;
  fanSpeed?: string | number;
  fanSpeedValues?: HomeyCapabilityEnumValue[];
  fanSpeedMin?: number;
  fanSpeedMax?: number;
  fanSpeedStep?: number;
  swings: SwingControl[];
};


type State =
  | { status: "loading" }
  | { status: "ok"; heaters: HeaterDevice[] }
  | { status: "error"; message: string };

function isHyttaZone(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("hytt");
}

function isQlimaDevice(d: HomeyDeviceSnapshot): boolean {
  const driver = (d.driverUri ?? "").toLowerCase();
  const name = d.name.toLowerCase();
  return driver.includes("qlima") || name.includes("qlima");
}

function buildHeaters(
  devices: HomeyDeviceSnapshot[],
  zones: HomeyZone[],
  location: HeaterLocation,
): HeaterDevice[] {
  const zoneById = new Map(zones.map((z) => [z.id, z.name]));
  const out: HeaterDevice[] = [];
  for (const d of devices) {
    const ttCap = d.capabilities["target_temperature"];
    const onoffCap = d.capabilities["onoff"];
    const measureCap = d.capabilities["measure_temperature"];
    const modeCap = d.capabilities["thermostat_mode"];
    const fanEntry =
      (["fan_speed", "fan_mode", "qlima_fan_speed", "fan_level", "fan_rate", "fan_power"] as const)
        .map((k) => [k, d.capabilities[k]] as const)
        .find(([, c]) => !!c) ??
      Object.entries(d.capabilities).find(([k]) => /^fan[_-]?(speed|mode|level|rate|power)/i.test(k));
    const fanCap = fanEntry?.[1];
    const fanCapId = fanEntry?.[0];

    const isQlima = isQlimaDevice(d);
    const hasTarget = !!ttCap && typeof ttCap.value === "number";
    // Behold enheten dersom den har target_temperature ELLER er Qlima/klima-enhet
    // med termostatmodus eller on/off (Qlima rapporterer ikke alltid target i alle moduser).
    const isClimateLike =
      isQlima ||
      !!modeCap ||
      (d.class === "thermostat" || d.class === "heater" || d.class === "airconditioning");
    if (!hasTarget && !isClimateLike) continue;
    if (!hasTarget && !modeCap && !onoffCap && !fanCap) continue;

    const zoneName = d.zone ? zoneById.get(d.zone) ?? "" : "";
    const combined = `${d.name} ${zoneName}`.toLowerCase();
    const belongsToHytta = isHyttaZone(zoneName) || combined.includes("hytt") || isQlima;
    if (location === "hytta" && !belongsToHytta) continue;
    if (location === "borg" && belongsToHytta) continue;

    const targetVal = hasTarget ? (ttCap!.value as number) : undefined;

    // Detect swing-like capabilities (horizontal/vertical air direction)
    const swings: SwingControl[] = [];
    for (const [capId, cap] of Object.entries(d.capabilities)) {
      if (
        !/swing|vane|louver|oscill|airdir|air_dir|fan_dir|flap|wind_dir|updown|up_?down|leftright|left_?right|direction|^vertical$|^horizontal$|vane_vertical|vane_horizontal/i.test(
          capId,
        )
      )
        continue;
      const isHoriz = /horiz|side|sideway|left_?right|leftright|^horizontal$|vane_horizontal/i.test(capId);
      const isVert = /vert|up_?down|updown|^vertical$|vane_vertical/i.test(capId);
      const label = isHoriz
        ? "Side til side"
        : isVert
          ? "Opp og ned"
          : capId.replace(/_/g, " ");

      const v = cap?.value;
      const kind: "boolean" | "enum" =
        (cap?.values?.length ?? 0) > 0 || typeof v === "string"
          ? "enum"
          : "boolean";
      swings.push({
        capabilityId: capId,
        label,
        kind,
        value: (typeof v === "boolean" || typeof v === "string" || typeof v === "number") ? v : undefined,
        values: cap?.values,
      });
    }
    // Sort: vertical first, then horizontal, then other
    swings.sort((a, b) => {
      const score = (s: SwingControl) =>
        /vert|up_?down|updown|^vertical$|vane_vertical/i.test(s.capabilityId) ? 0
          : /horiz|side|left_?right|^horizontal$|vane_horizontal/i.test(s.capabilityId) ? 1
          : 2;
      return score(a) - score(b);
    });


    out.push({
      id: d.id,
      name: d.name,
      zoneName: zoneName || "Ukjent sal",
      isQlima,
      onoff: typeof onoffCap?.value === "boolean" ? onoffCap.value : undefined,
      target: targetVal,
      measure: typeof measureCap?.value === "number" ? measureCap.value : undefined,
      min: typeof ttCap?.min === "number" ? ttCap.min : isQlima ? 16 : 5,
      max: typeof ttCap?.max === "number" ? ttCap.max : isQlima ? 32 : 30,
      step: typeof ttCap?.step === "number" ? ttCap.step : isQlima ? 1 : 0.5,
      hasTarget,
      thermostatMode:
        typeof modeCap?.value === "string" ? modeCap.value : undefined,
      thermostatModeValues: modeCap?.values,
      fanCapabilityId: fanCapId,
      fanSpeed:
        typeof fanCap?.value === "string" || typeof fanCap?.value === "number"
          ? fanCap.value
          : undefined,
      fanSpeedValues: fanCap?.values,
      fanSpeedMin: typeof fanCap?.min === "number" ? fanCap.min : undefined,
      fanSpeedMax: typeof fanCap?.max === "number" ? fanCap.max : undefined,
      fanSpeedStep: typeof fanCap?.step === "number" ? fanCap.step : undefined,
      swings,
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
  collapsible = false,
  defaultCollapsed = false,
  compact = false,
}: {
  location: HeaterLocation;
  title: string;
  emptyHint?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  compact?: boolean;
}) {
  const fetchSnapshot = useServerFn(getHomeySnapshot);
  const setCap = useServerFn(setLivingRoomDeviceCapability);

  const [state, setState] = useState<State>({ status: "loading" });
  const [collapsed, setCollapsed] = useState<boolean>(collapsible && defaultCollapsed);
  const [overrides, setOverrides] = useState<
    Record<
      string,
      {
        onoff?: boolean;
        target?: number;
        thermostatMode?: string;
        fanSpeed?: string | number;
      }
    >
  >({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Celsius / Fahrenheit toggle (persistert i localStorage)
  const [unit, setUnit] = useState<"C" | "F">(() => {
    if (typeof window === "undefined") return "C";
    const saved = window.localStorage.getItem("hpr.tempUnit");
    return saved === "F" ? "F" : "C";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("hpr.tempUnit", unit);
    }
  }, [unit]);

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
            const remaining: {
              onoff?: boolean;
              target?: number;
              thermostatMode?: string;
              fanSpeed?: string | number;
            } = {};
            if (o.onoff !== undefined && o.onoff !== h.onoff) remaining.onoff = o.onoff;
            if (o.target !== undefined && o.target !== h.target) remaining.target = o.target;
            if (
              o.thermostatMode !== undefined &&
              o.thermostatMode !== h.thermostatMode
            )
              remaining.thermostatMode = o.thermostatMode;
            if (o.fanSpeed !== undefined && o.fanSpeed !== h.fanSpeed)
              remaining.fanSpeed = o.fanSpeed;
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
      capability: string,
      value: boolean | number | string,
    ) => {
      const key = `${heaterId}:${capability}`;
      if (busy[key]) return;
      setBusy((b) => ({ ...b, [key]: true }));
      const overrideKey =
        capability === "onoff"
          ? "onoff"
          : capability === "target_temperature"
            ? "target"
            : capability === "thermostat_mode"
              ? "thermostatMode"
              : /^fan[_-]?(speed|mode|level|rate|power)/i.test(capability) ||
                  capability === "qlima_fan_speed"
                ? "fanSpeed"
                : null;

      if (overrideKey) {
        setOverrides((o) => ({
          ...o,
          [heaterId]: {
            ...(o[heaterId] ?? {}),
            [overrideKey]: value,
          },
        }));
      }
      try {
        const res = await setCap({
          data: { deviceId: heaterId, capability: capability as any, value },
        });
        recordHomeyApiCall();
        if (!res.ok) {
          if (overrideKey) {
            setOverrides((o) => {
              const next = { ...o };
              const cur = next[heaterId];
              if (cur) {
                delete (cur as any)[overrideKey];
                if (Object.keys(cur).length === 0) delete next[heaterId];
              }
              return next;
            });
          }
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
      if (!o) return h;
      return {
        ...h,
        target: o.target ?? h.target,
        onoff: o.onoff ?? h.onoff,
        thermostatMode: o.thermostatMode ?? h.thermostatMode,
        fanSpeed: o.fanSpeed ?? h.fanSpeed,
      };
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

  // Sammendrag for collapse-knapp
  const summary = useMemo(() => {
    if (state.status !== "ok") return null;
    const total = heaters.length;
    const onCount = heaters.filter((h) => h.onoff !== false).length;
    const targets = heaters.map((h) => h.target).filter((t): t is number => typeof t === "number");
    const avgTarget = targets.length
      ? targets.reduce((s, n) => s + n, 0) / targets.length
      : null;
    return { total, onCount, avgTarget };
  }, [state, heaters]);

  const isCollapsed = collapsible && collapsed;

  return (
    <section className="container mx-auto px-4 py-12">
      {collapsible
        ? (
          <div className="ornate-divider mb-6 w-full flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!isCollapsed}
              className="flex-1 flex items-center justify-between gap-3 cursor-pointer group"
            >
              <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
                {title}
              </span>
              <span className="flex items-center gap-3 text-[10px] tracking-[0.25em] text-muted-foreground uppercase shrink-0">
                {summary && summary.total > 0 && (
                  <>
                    <span className="hidden sm:inline-flex items-center gap-1">
                      <Flame size={11} className="text-primary/70" />
                      {summary.onCount}/{summary.total}
                    </span>
                    {summary.avgTarget !== null && (
                      <span className="tabular-nums">
                        {formatTempForDisplay(summary.avgTarget, unit)}°{unit}
                      </span>
                    )}
                  </>
                )}
                <ChevronDown
                  size={16}
                  className={`text-primary/70 transition-transform duration-300 ${
                    isCollapsed ? "" : "rotate-180"
                  }`}
                />
              </span>
            </button>
            <UnitToggle unit={unit} onChange={setUnit} />
          </div>
        )
        : (
          <div className="ornate-divider mb-6 flex items-center justify-between gap-3">
            <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
              {title}
            </span>
            <UnitToggle unit={unit} onChange={setUnit} />
          </div>
        )}

      {!isCollapsed && (
        <>
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
                  <div className={compact ? "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4" : "grid sm:grid-cols-2 lg:grid-cols-3 gap-4"}>
                    {list.map((h) => (
                      <HeaterCard
                        key={h.id}
                        heater={h}
                        busy={busy}
                        compact={compact}
                        unit={unit}
                        onSetTemp={(v) => sendCap(h.id, "target_temperature", v)}
                        onToggle={(v) => sendCap(h.id, "onoff", v)}
                        onSetMode={(v) => sendCap(h.id, "thermostat_mode", v)}
                        onSetFan={(v) =>
                          sendCap(
                            h.id,
                            h.fanCapabilityId ??
                              (h.fanSpeedValues || h.fanSpeed !== undefined
                                ? "fan_speed"
                                : "fan_mode"),
                            v,
                          )
                        }
                        onSetSwing={(capId, v) => sendCap(h.id, capId, v)}

                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

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

const QLIMA_DEFAULT_MODES: HomeyCapabilityEnumValue[] = [
  { id: "auto", title: "Auto" },
  { id: "heat", title: "Varme" },
  { id: "cool", title: "Kjøl" },
  { id: "dry", title: "Tørk" },
  { id: "fan", title: "Vifte" },
];

function cToF(c: number): number {
  return c * 1.8 + 32;
}
function fToC(f: number): number {
  return (f - 32) / 1.8;
}
function formatTempForDisplay(c: number, unit: "C" | "F"): string {
  const v = unit === "F" ? cToF(c) : c;
  return v.toFixed(1);
}

function UnitToggle({
  unit,
  onChange,
}: {
  unit: "C" | "F";
  onChange: (u: "C" | "F") => void;
}) {
  return (
    <div
      role="group"
      aria-label="Velg temperaturenhet"
      className="inline-flex rounded-full overflow-hidden text-[10px] tracking-[0.2em] uppercase shrink-0"
      style={{
        border: `1px solid color-mix(in oklab, var(--gold) 28%, transparent)`,
      }}
    >
      {(["C", "F"] as const).map((u) => {
        const active = u === unit;
        return (
          <button
            key={u}
            type="button"
            onClick={() => onChange(u)}
            className="px-2.5 py-1 transition-colors"
            style={{
              background: active
                ? `color-mix(in oklab, var(--gold) 22%, transparent)`
                : "transparent",
              color: active ? "var(--gold)" : "var(--muted-foreground)",
            }}
          >
            °{u}
          </button>
        );
      })}
    </div>
  );
}

function swingValueIcon(id: string, title?: string): typeof Sun {
  const s = `${id} ${title ?? ""}`.toLowerCase();
  if (/auto/.test(s)) return RefreshCw;
  if (/oppover|^up$|opp\b|top/.test(s)) return ArrowUp;
  if (/nedover|^down$|ned\b|bottom/.test(s)) return ArrowDown;
  if (/venstre|left/.test(s)) return ArrowLeft;
  if (/h(ø|o)yre|right/.test(s)) return ArrowRight;
  if (/midt|midten|center|middle/.test(s)) return Minus;
  if (/sving|swing|oscill/.test(s)) return RotateCw;
  if (/bred|wide|full|range/.test(s)) return Maximize2;
  return Move;
}

function swingHeaderIcon(label: string, capabilityId: string): typeof Sun {
  const s = `${label} ${capabilityId}`.toLowerCase();
  if (/opp|ned|vert|updown|vane_vertical|^vertical/.test(s)) return ArrowUpDown;
  if (/side|left|right|horiz|leftright|vane_horizontal|^horizontal/.test(s)) return ArrowLeftRight;
  return Move;
}

function HeaterCard({
  heater,
  busy,
  compact = false,
  unit,
  onSetTemp,
  onToggle,
  onSetMode,
  onSetFan,
  onSetSwing,
}: {
  heater: HeaterDevice;
  busy: Record<string, boolean>;
  compact?: boolean;
  unit: "C" | "F";
  onSetTemp: (v: number) => void;
  onToggle: (v: boolean) => void;
  onSetMode: (v: string) => void;
  onSetFan: (v: string | number) => void;
  onSetSwing: (capabilityId: string, value: boolean | string | number) => void;
}) {
  const accent = "var(--gold)";
  const tempBusy = busy[`${heater.id}:target_temperature`];
  const onoffBusy = busy[`${heater.id}:onoff`];
  const modeBusy = busy[`${heater.id}:thermostat_mode`];
  const fanBusy =
    busy[`${heater.id}:${heater.fanCapabilityId ?? "fan_speed"}`] ||
    busy[`${heater.id}:fan_speed`] ||
    busy[`${heater.id}:fan_mode`];

  const isOn = heater.onoff !== false;

  const supportsMode =
    heater.thermostatMode !== undefined ||
    (heater.thermostatModeValues?.length ?? 0) > 0 ||
    heater.isQlima;
  const modes =
    heater.thermostatModeValues?.length
      ? heater.thermostatModeValues
      : supportsMode
        ? QLIMA_DEFAULT_MODES
        : [];

  const supportsFan =
    heater.fanSpeed !== undefined || (heater.fanSpeedValues?.length ?? 0) > 0;
  const fanValues: HomeyCapabilityEnumValue[] = heater.fanSpeedValues?.length
    ? heater.fanSpeedValues
    : supportsFan && heater.isQlima
      ? [
          { id: "auto", title: "Auto" },
          { id: "low", title: "Lav" },
          { id: "medium", title: "Med" },
          { id: "high", title: "Høy" },
        ]
      : [];

  // Lokalt slider-state for jevn dragging — committer ved release
  const [localTemp, setLocalTemp] = useState<number | null>(null);
  const sliderValue = localTemp ?? heater.target ?? heater.min;
  const sliderPct = Math.max(
    0,
    Math.min(
      100,
      ((sliderValue - heater.min) / Math.max(0.0001, heater.max - heater.min)) * 100,
    ),
  );

  const commitLocal = () => {
    if (localTemp === null) return;
    const v = +localTemp.toFixed(1);
    setLocalTemp(null);
    if (v !== heater.target) onSetTemp(v);
  };

  // Steg-veksler: 0.5 eller 1 grad pr +/- (persistert pr enhet)
  const stepKey = `hpr.step.${heater.id}`;
  const [userStep, setUserStep] = useState<0.5 | 1>(() => {
    if (typeof window === "undefined") return 0.5;
    const v = window.localStorage.getItem(stepKey);
    return v === "1" ? 1 : 0.5;
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(stepKey, String(userStep));
  }, [userStep, stepKey]);
  const effStep = Math.max(heater.step, userStep);

  const adjust = (delta: number) => {
    const cur = heater.target ?? 21;
    const next = Math.min(heater.max, Math.max(heater.min, +(cur + delta).toFixed(1)));
    if (next === cur) return;
    onSetTemp(next);
  };

  // Mindre padding/font på mobil når compact er på (men full størrelse fra sm: og oppover)
  const headerPad = compact ? "px-2.5 py-1.5 sm:px-4 sm:py-2" : "px-4 py-2";
  const bodyPad = compact ? "p-2.5 sm:p-4" : "p-4";
  const bodyGap = compact ? "gap-1.5 sm:gap-3" : "gap-3";
  const titleSize = compact ? "text-[9px] sm:text-[10px]" : "text-[10px]";
  const tempFontSize = compact ? "clamp(1.5rem, 9vw, 3.5rem)" : "clamp(2rem, 6vw, 3.5rem)";
  const measureText = compact ? "text-[9px] sm:text-[10px]" : "text-[10px]";
  const btnPad = compact ? "py-1.5 sm:py-2.5" : "py-2.5";
  const onoffPad = compact ? "px-3 py-1 sm:px-4 sm:py-1.5 text-[9px] sm:text-[10px]" : "px-4 py-1.5 text-[10px]";

  const stepLabel =
    unit === "F"
      ? `${(effStep * 1.8).toFixed(1)}°`
      : `${effStep}°`;

  return (
    <article className="panel rounded-lg overflow-hidden flex flex-col">
      <div className={`${headerPad} border-b border-border flex items-center justify-between`}>
        <span
          className={`text-display tracking-[0.25em] sm:tracking-[0.3em] text-primary ${titleSize} uppercase truncate`}
          title={heater.name}
        >
          {heater.name}
        </span>
        <span className="hidden sm:inline text-[9px] tracking-[0.25em] text-muted-foreground/70 uppercase shrink-0 ml-2">
          {heater.isQlima ? "Qlima" : "Ovn"}
        </span>
      </div>
      <div className={`flex-1 ${bodyPad} flex flex-col items-center justify-center ${bodyGap}`}>
        <Thermometer size={compact ? 14 : 18} className={compact ? "sm:size-[18px]" : ""} style={{ color: accent }} />

        {heater.hasTarget ? (
          <div
            className="text-display leading-none tabular-nums"
            style={{ color: accent, fontSize: tempFontSize }}
          >
            {formatTempForDisplay(heater.target ?? 0, unit)}°{unit}
          </div>
        ) : (
          <div
            className="text-display leading-none tabular-nums opacity-60"
            style={{ color: accent, fontSize: tempFontSize }}
          >
            —
          </div>
        )}

        {heater.measure !== undefined && (
          <div className={`${measureText} tracking-[0.2em] sm:tracking-[0.25em] text-muted-foreground/80 uppercase text-center`}>
            {compact
              ? `Nå ${formatTempForDisplay(heater.measure, unit)}°${unit}`
              : `Måler ${formatTempForDisplay(heater.measure, unit)}°${unit} nå`}
          </div>
        )}

        {heater.hasTarget && (
          <>
            <div className="w-full mt-0.5 sm:mt-1 px-1">
              <input
                type="range"
                min={heater.min}
                max={heater.max}
                step={heater.step}
                value={sliderValue}
                onChange={(e) => setLocalTemp(parseFloat(e.target.value))}
                onPointerUp={commitLocal}
                onPointerCancel={() => setLocalTemp(null)}
                onTouchEnd={commitLocal}
                onMouseUp={commitLocal}
                onKeyUp={commitLocal}
                disabled={tempBusy}
                aria-label="Velg temperatur"
                className="w-full h-2 rounded-full appearance-none cursor-pointer disabled:opacity-50 touch-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--thumb)] [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--thumb)] [&::-moz-range-thumb]:border-0"
                style={{
                  background: `linear-gradient(to right, ${accent} 0%, ${accent} ${sliderPct}%, color-mix(in oklab, var(--foreground) 12%, transparent) ${sliderPct}%, color-mix(in oklab, var(--foreground) 12%, transparent) 100%)`,
                  ["--thumb" as any]: accent,
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full mt-0.5 sm:mt-1 items-center">
              <button
                type="button"
                onClick={() => adjust(-effStep)}
                disabled={tempBusy || (heater.target ?? 0) <= heater.min}
                aria-label="Senk temperatur"
                className={`rounded ${btnPad} flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95`}
                style={{
                  background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
                  border: `1px solid color-mix(in oklab, ${accent} 30%, transparent)`,
                  color: accent,
                }}
              >
                <Minus size={compact ? 14 : 18} />
              </button>
              <div className="flex flex-col items-center gap-1">
                <div className="text-[9px] tracking-[0.2em] sm:tracking-[0.25em] uppercase text-muted-foreground">
                  {tempBusy ? <Loader2 size={12} className="animate-spin" /> : stepLabel}
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
                onClick={() => adjust(effStep)}
                disabled={tempBusy || (heater.target ?? 0) >= heater.max}
                aria-label="Hev temperatur"
                className={`rounded ${btnPad} flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95`}
                style={{
                  background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
                  border: `1px solid color-mix(in oklab, ${accent} 30%, transparent)`,
                  color: accent,
                }}
              >
                <Plus size={compact ? 14 : 18} />
              </button>
            </div>
          </>
        )}

        {supportsMode && modes.length > 0 && (
          <div className="w-full mt-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                Modus
              </span>
              {modeBusy && (
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              )}
            </div>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(64px, 1fr))` }}
            >
              {modes.map((m) => {
                const meta = modeMeta(m.id, m.title);
                const active =
                  heater.thermostatMode !== undefined &&
                  heater.thermostatMode.toLowerCase() === m.id.toLowerCase();
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
                    className="rounded py-2 px-2 flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-50 active:scale-95 min-h-[52px]"
                    style={{
                      background: active
                        ? `color-mix(in oklab, ${accent} 22%, transparent)`
                        : "color-mix(in oklab, var(--foreground) 6%, transparent)",
                      border: `1px solid color-mix(in oklab, ${accent} ${active ? 55 : 18}%, transparent)`,
                      color: active ? accent : "var(--muted-foreground)",
                    }}
                  >
                    <meta.Icon size={14} />
                    <span className="text-[9px] tracking-[0.15em] uppercase leading-tight text-center">
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {supportsFan && fanValues.length > 0 && (
          <div className="w-full max-w-[260px] mt-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                Vifte
              </span>
              {fanBusy && (
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              )}
            </div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${Math.min(fanValues.length, 5)}, minmax(0, 1fr))` }}
            >
              {fanValues.map((f) => {
                const active =
                  heater.fanSpeed !== undefined &&
                  String(heater.fanSpeed).toLowerCase() === String(f.id).toLowerCase();
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (active || fanBusy) return;
                      onSetFan(f.id);
                    }}
                    disabled={fanBusy}
                    aria-label={`Vifte ${f.title ?? f.id}`}
                    title={f.title ?? f.id}
                    className="rounded py-1.5 flex items-center justify-center transition-all disabled:opacity-50 active:scale-95"
                    style={{
                      background: active
                        ? `color-mix(in oklab, ${accent} 22%, transparent)`
                        : "color-mix(in oklab, var(--foreground) 6%, transparent)",
                      border: `1px solid color-mix(in oklab, ${accent} ${active ? 55 : 18}%, transparent)`,
                      color: active ? accent : "var(--muted-foreground)",
                    }}
                  >
                    <span className="text-[8px] tracking-[0.15em] uppercase">
                      {f.title ?? f.id}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {heater.swings.length > 0 && (
          <div className="w-full max-w-[260px] mt-1 space-y-2">
            {heater.swings.map((sw) => {
              const swBusy = busy[`${heater.id}:${sw.capabilityId}`];
              if (sw.kind === "boolean") {
                const active = sw.value === true;
                return (
                  <div key={sw.capabilityId}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                        {sw.label}
                      </span>
                      {swBusy && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                    </div>
                    <button
                      type="button"
                      onClick={() => !swBusy && onSetSwing(sw.capabilityId, !active)}
                      disabled={swBusy}
                      className="w-full rounded py-1.5 text-[9px] tracking-[0.25em] uppercase transition-all disabled:opacity-50"
                      style={{
                        background: active
                          ? `color-mix(in oklab, ${accent} 22%, transparent)`
                          : "color-mix(in oklab, var(--foreground) 6%, transparent)",
                        border: `1px solid color-mix(in oklab, ${accent} ${active ? 50 : 22}%, transparent)`,
                        color: active ? accent : "var(--muted-foreground)",
                      }}
                    >
                      {active ? "Sving på" : "Sving av"}
                    </button>
                  </div>
                );
              }
              const values = sw.values ?? [];
              return (
                <div key={sw.capabilityId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
                      {sw.label}
                    </span>
                    {swBusy && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                  </div>
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(values.length, 1), 5)}, minmax(0, 1fr))` }}
                  >
                    {values.map((v) => {
                      const active = String(sw.value ?? "").toLowerCase() === String(v.id).toLowerCase();
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => !swBusy && !active && onSetSwing(sw.capabilityId, v.id)}
                          disabled={swBusy}
                          className="rounded py-1.5 text-[8px] tracking-[0.15em] uppercase transition-all disabled:opacity-50"
                          style={{
                            background: active
                              ? `color-mix(in oklab, ${accent} 22%, transparent)`
                              : "color-mix(in oklab, var(--foreground) 6%, transparent)",
                            border: `1px solid color-mix(in oklab, ${accent} ${active ? 50 : 18}%, transparent)`,
                            color: active ? accent : "var(--muted-foreground)",
                          }}
                        >
                          {v.title ?? v.id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}


        {heater.onoff !== undefined && (
          <button
            type="button"
            onClick={() => onToggle(!isOn)}
            disabled={onoffBusy}
            className={`rounded ${onoffPad} tracking-[0.25em] sm:tracking-[0.3em] uppercase font-semibold transition-all disabled:opacity-50`}
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

// referert i HeaterCard via heater.isQlima — beholder for bakoverkompat hvis brukt andre steder
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isQlimaName(name: string): boolean {
  return name.toLowerCase().includes("qlima");
}

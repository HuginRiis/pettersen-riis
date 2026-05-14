import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGardenaSnapshot, controlGardenaMower } from "@/lib/gardena.functions";
import { GardenaMap } from "@/components/GardenaMap";
import {
  Bot, Battery, BatteryLow, BatteryFull, AlertTriangle, CheckCircle2,
  Activity, RefreshCw, Loader2, Play, ParkingSquare, Pause, Signal, Clock,
  Thermometer, Droplets, Sun, MapPin, CalendarClock, Settings2, Hash,
} from "lucide-react";

type Snap = Awaited<ReturnType<typeof getGardenaSnapshot>>;
type Mower = Snap["mowers"][number];
type Sensor = Snap["sensors"][number];

function ago(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "nå";
  const m = Math.round(diff / 60_000);
  if (m < 1) return "nå";
  if (m < 60) return `${m} min siden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} t siden`;
  return `${Math.round(h / 24)} d siden`;
}

const STATE_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "error" | "info" }> = {
  OK: { label: "OK", tone: "ok" },
  WARNING: { label: "Advarsel", tone: "warn" },
  ERROR: { label: "Feil", tone: "error" },
  UNAVAILABLE: { label: "Utilgjengelig", tone: "error" },
};
const ACTIVITY_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "error" | "info" }> = {
  PAUSED: { label: "Pauset", tone: "warn" },
  OK_CUTTING: { label: "Klipper", tone: "ok" },
  OK_CUTTING_TIMER_OVERRIDDEN: { label: "Klipper (override)", tone: "ok" },
  OK_SEARCHING: { label: "Søker dokk", tone: "info" },
  OK_LEAVING: { label: "Forlater dokk", tone: "info" },
  OK_CHARGING: { label: "Lader", tone: "info" },
  PARKED_TIMER: { label: "Parkert (timer)", tone: "info" },
  PARKED_PARK_SELECTED: { label: "Parkert (manuell)", tone: "info" },
  PARKED_AUTOTIMER: { label: "Parkert (auto)", tone: "info" },
  NONE: { label: "Inaktiv", tone: "info" },
};

function tone(t: "ok" | "warn" | "error" | "info"): string {
  switch (t) {
    case "ok": return "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";
    case "warn": return "text-amber-400 border-amber-400/30 bg-amber-400/10";
    case "error": return "text-destructive border-destructive/30 bg-destructive/10";
    default: return "text-primary border-primary/30 bg-primary/10";
  }
}

function batteryIcon(level: number | null) {
  if (level === null) return Battery;
  if (level < 20) return BatteryLow;
  if (level >= 90) return BatteryFull;
  return Battery;
}

function fmtVal(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "ja" : "nei";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "object") {
    if ("value" in v) {
      const inner = fmtVal((v as any).value);
      const ts = (v as any).timestamp;
      return ts ? `${inner}  ·  ${ago(ts)}` : inner;
    }
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

const ATTR_LABELS: Record<string, string> = {
  state: "Tilstand",
  activity: "Aktivitet",
  lastErrorCode: "Sist feil",
  operatingHours: "Driftstimer",
  batteryLevel: "Batteri %",
  batteryState: "Batteristatus",
  rfLinkLevel: "Signalstyrke",
  rfLinkState: "Signal-status",
  serial: "Serienr",
  modelType: "Modell",
  name: "Navn",
  soilHumidity: "Jord-fukt %",
  soilTemperature: "Jord-temp °C",
  ambientTemperature: "Luft-temp °C",
  lightIntensity: "Lys lx",
};

function MowerCard({
  mower,
  onCommand,
  busy,
}: {
  mower: Mower;
  onCommand: (svcId: string, cmd: string, seconds?: number) => void;
  busy: string | null;
}) {
  const stateInfo = mower.state ? (STATE_LABELS[mower.state] ?? { label: mower.state, tone: "info" as const }) : null;
  const actInfo = mower.activity ? (ACTIVITY_LABELS[mower.activity] ?? { label: mower.activity.replaceAll("_", " ").toLowerCase(), tone: "info" as const }) : null;
  const BatteryIcon = batteryIcon(mower.battery);
  const hasError = !!mower.lastErrorCode && mower.lastErrorCode.toLowerCase() !== "no_message";
  const mowerSvc = mower.raw.find((s) => s.type === "MOWER");
  const svcId = mowerSvc?.id ?? null;

  const isBusy = (cmd: string) => busy === `${svcId}:${cmd}`;

  return (
    <div className="panel rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-primary shrink-0" />
            <h3 className="text-sm font-medium truncate">{mower.name}</h3>
          </div>
          <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-1">
            {mower.locationName}
            {mower.modelType ? ` · ${mower.modelType}` : ""}
            {mower.serial ? ` · #${mower.serial}` : ""}
          </p>
        </div>
        {stateInfo && (
          <span className={`text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded border ${tone(stateInfo.tone)}`}>
            {stateInfo.label}
          </span>
        )}
      </div>

      {actInfo && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded border ${tone(actInfo.tone)}`}>
          <Activity size={14} />
          <span className="uppercase tracking-[0.15em]">{actInfo.label}</span>
          {mower.activityTimestamp && (
            <span className="ml-auto text-[10px] opacity-70">{ago(mower.activityTimestamp)}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <BatteryIcon
            size={18}
            className={
              mower.battery !== null && mower.battery < 20
                ? "text-amber-400"
                : mower.batteryState === "CHARGING"
                  ? "text-emerald-400"
                  : "text-primary/70"
            }
          />
          <div>
            <div className="text-sm tabular-nums">
              {mower.battery !== null ? `${Math.round(mower.battery)}%` : "—"}
            </div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              {mower.batteryState ? mower.batteryState.toLowerCase() : "Batteri"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Signal size={16} className="text-primary/70" />
          <div>
            <div className="text-sm tabular-nums">
              {mower.rfLinkLevel !== null ? `${mower.rfLinkLevel}%` : "—"}
            </div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              {mower.rfLinkState ? mower.rfLinkState.toLowerCase() : "Signal"}
            </div>
          </div>
        </div>
        {mower.operatingHours !== null && (
          <div className="flex items-center gap-2 col-span-2">
            <Clock size={16} className="text-primary/70" />
            <div>
              <div className="text-sm tabular-nums">{mower.operatingHours} t</div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                Driftstimer totalt
              </div>
            </div>
          </div>
        )}
      </div>

      {hasError && (
        <div className="flex items-start gap-2 text-xs text-destructive border border-destructive/30 bg-destructive/10 rounded px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="uppercase tracking-[0.15em] text-[10px]">Sist feil</div>
            <div className="mt-0.5 truncate">{mower.lastErrorCode}</div>
            {mower.lastErrorTimestamp && (
              <div className="text-[10px] opacity-70">{ago(mower.lastErrorTimestamp)}</div>
            )}
          </div>
        </div>
      )}
      {!hasError && mower.lastErrorCode && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span>Ingen feil</span>
        </div>
      )}

      {/* Kommandoer */}
      {svcId && (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => onCommand(svcId, "START_DONT_OVERRIDE")}
            className="text-[10px] tracking-[0.2em] uppercase border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-50 rounded px-2 py-2 flex items-center justify-center gap-1"
          >
            {isBusy("START_DONT_OVERRIDE") ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Start
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => onCommand(svcId, "PARK_UNTIL_NEXT_TASK")}
            className="text-[10px] tracking-[0.2em] uppercase border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 rounded px-2 py-2 flex items-center justify-center gap-1"
          >
            {isBusy("PARK_UNTIL_NEXT_TASK") ? <Loader2 size={12} className="animate-spin" /> : <ParkingSquare size={12} />}
            Park
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => onCommand(svcId, "PARK_UNTIL_FURTHER_NOTICE")}
            className="text-[10px] tracking-[0.2em] uppercase border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 disabled:opacity-50 rounded px-2 py-2 flex items-center justify-center gap-1"
          >
            {isBusy("PARK_UNTIL_FURTHER_NOTICE") ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
            Park ∞
          </button>
        </div>
      )}

      {/* Override-kjøring (timer) */}
      {svcId && (
        <div className="grid grid-cols-3 gap-2">
          {[60, 180, 360].map((mins) => (
            <button
              key={mins}
              type="button"
              disabled={!!busy}
              onClick={() => onCommand(svcId, "START_SECONDS_TO_OVERRIDE", mins * 60)}
              className="text-[10px] tracking-[0.2em] uppercase border border-border hover:border-primary/40 hover:text-primary disabled:opacity-50 rounded px-2 py-2 flex items-center justify-center gap-1"
            >
              {isBusy("START_SECONDS_TO_OVERRIDE") ? <Loader2 size={12} className="animate-spin" /> : <Play size={10} />}
              {mins < 60 ? `${mins}m` : `${mins / 60}t`}
            </button>
          ))}
        </div>
      )}

      {/* Alle innstillinger / sensorer / råverdier */}
      <details className="text-xs text-muted-foreground" open>
        <summary className="cursor-pointer text-[10px] tracking-[0.25em] uppercase hover:text-primary flex items-center gap-2">
          <Settings2 size={12} />
          Alle innstillinger og sensorer ({mower.raw.length} tjenester)
        </summary>
        <div className="mt-3 space-y-3">
          {mower.raw.map((s) => (
            <div key={s.id} className="border border-border/40 rounded p-2.5 bg-background/30">
              <div className="text-[10px] tracking-[0.2em] uppercase text-primary mb-1.5 flex items-center gap-2">
                {s.type}
                <span className="text-muted-foreground/50 font-mono normal-case tracking-normal text-[9px]">
                  {s.id.slice(0, 8)}…
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1 max-h-72 overflow-auto pr-1">
                {Object.entries(s.attributes).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/20 py-1">
                    <span className="text-[11px] truncate text-muted-foreground">
                      {ATTR_LABELS[k] ?? k}
                    </span>
                    <span className="tabular-nums text-foreground text-right truncate max-w-[60%] text-[11px]">
                      {fmtVal(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      <div className="flex items-start gap-2 text-[10px] text-muted-foreground border-t border-border/30 pt-3">
        <CalendarClock size={11} className="mt-0.5 shrink-0" />
        <span>
          Tidsplan og grense (boundary) konfigureres i Gardena-appen — Smart System v2 API
          eksponerer ikke disse direkte. Status og overstyring vises her i sanntid.
        </span>
      </div>

      {svcId && (
        <div className="text-[9px] text-muted-foreground/70 font-mono truncate flex items-center gap-1">
          <Hash size={9} /> {svcId}
        </div>
      )}
    </div>
  );
}

function SensorCard({ sensor }: { sensor: Sensor }) {
  return (
    <div className="panel rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium truncate">{sensor.name}</h3>
          <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-1">
            Sensor{sensor.modelType ? ` · ${sensor.modelType}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs tabular-nums">
          <Battery size={14} className="text-primary/70" />
          {sensor.battery !== null ? `${Math.round(sensor.battery)}%` : "—"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Thermometer size={14} className="text-amber-400" />
          <div>
            <div className="tabular-nums">
              {sensor.ambientTemperature.value !== null ? `${sensor.ambientTemperature.value}°` : "—"}
            </div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Luft</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Thermometer size={14} className="text-emerald-400" />
          <div>
            <div className="tabular-nums">
              {sensor.soilTemperature.value !== null ? `${sensor.soilTemperature.value}°` : "—"}
            </div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Jord</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Droplets size={14} className="text-sky-400" />
          <div>
            <div className="tabular-nums">
              {sensor.soilHumidity.value !== null ? `${sensor.soilHumidity.value}%` : "—"}
            </div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Jord-fukt</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Sun size={14} className="text-yellow-300" />
          <div>
            <div className="tabular-nums">
              {sensor.lightIntensity.value !== null ? `${sensor.lightIntensity.value} lx` : "—"}
            </div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Lys</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GardenaPanel() {
  const fetchSnap = useServerFn(getGardenaSnapshot);
  const sendCmd = useServerFn(controlGardenaMower);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetchSnap();
      setSnap(res);
    } catch (e: any) {
      setSnap({
        ok: false,
        error: e?.message ?? "Ukjent feil",
        fetchedAt: new Date().toISOString(),
        locations: [],
        mowers: [],
        sensors: [],
        homeLat: 59.2096,
        homeLon: 9.609,
      });
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [fetchSnap]);

  useEffect(() => {
    load();
    // Husqvarna/Gardena API har strenge rate limits — poll hvert 5. minutt
    const id = window.setInterval(load, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const onCommand = async (svcId: string, cmd: string, seconds?: number) => {
    setBusy(`${svcId}:${cmd}`);
    setMsg(null);
    try {
      const res = await sendCmd({ data: { serviceId: svcId, command: cmd, seconds } });
      if (!res.ok) setMsg(`Feil: ${res.error ?? "ukjent"}`);
      else {
        setMsg(`Sendte ${cmd}`);
        setTimeout(load, 2500);
      }
    } catch (e: any) {
      setMsg(`Feil: ${e?.message ?? "ukjent"}`);
    } finally {
      setBusy(null);
    }
  };

  const mapTarget = useMemo(() => {
    if (!snap) return null;
    const loc = snap.locations.find((l) => l.lat !== null && l.lon !== null);
    if (loc && loc.lat !== null && loc.lon !== null) {
      return { lat: loc.lat, lon: loc.lon, label: loc.name };
    }
    return { lat: snap.homeLat, lon: snap.homeLon, label: snap.locations[0]?.name ?? "Hjem" };
  }, [snap]);

  return (
    <section className="container mx-auto px-4 py-12 space-y-8">
      <div>
        <div className="ornate-divider mb-6 flex items-center justify-between gap-3">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Gardena · Gressklippere
          </span>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-primary/80 hover:text-primary disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Oppdater
          </button>
        </div>

        {snap?.fetchedAt && (
          <p className="text-[10px] text-muted-foreground mb-4">
            Hentet {ago(snap.fetchedAt)} · {snap.mowers.length} {snap.mowers.length === 1 ? "klipper" : "klippere"}
            {snap.sensors.length > 0 ? ` · ${snap.sensors.length} sensor(er)` : ""}
            {snap.locations.length > 0 ? ` · ${snap.locations.length} lokasjon(er)` : ""}
          </p>
        )}

        {snap && !snap.ok && (
          <div className="rounded border border-destructive/30 bg-destructive/10 text-destructive text-xs p-3 mb-4">
            Kunne ikke hente fra Gardena: {snap.error}
          </div>
        )}

        {msg && (
          <div className="rounded border border-primary/30 bg-primary/10 text-primary text-xs p-3 mb-4">
            {msg}
          </div>
        )}

        {snap?.ok && snap.mowers.length === 0 && (
          <div className="rounded border border-border bg-card/60 text-muted-foreground text-xs p-4 italic">
            Ingen gressklippere funnet på din Gardena-konto.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snap?.mowers.map((m) => (
            <MowerCard key={m.id} mower={m} onCommand={onCommand} busy={busy} />
          ))}
        </div>
      </div>

      {/* Kart */}
      {mapTarget && (
        <div>
          <div className="ornate-divider mb-4 flex items-center gap-2">
            <MapPin size={14} className="text-primary" />
            <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
              Hvor er klipperen
            </span>
          </div>
          <div className="panel rounded-lg overflow-hidden">
            <div className="h-[320px]">
              <GardenaMap lat={mapTarget.lat} lon={mapTarget.lon} label={mapTarget.label} />
            </div>
            <div className="px-4 py-2 text-[10px] text-muted-foreground tracking-[0.2em] uppercase border-t border-border/40">
              {mapTarget.label} · {mapTarget.lat.toFixed(5)}, {mapTarget.lon.toFixed(5)}
              {snap?.locations[0]?.lat === null && (
                <span className="ml-2 normal-case tracking-normal opacity-70">
                  (Gardena returnerer ikke GPS — viser hjem-koordinater)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sensorer */}
      {snap?.sensors && snap.sensors.length > 0 && (
        <div>
          <div className="ornate-divider mb-4 flex items-center gap-2">
            <Thermometer size={14} className="text-primary" />
            <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
              Hagesensorer
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {snap.sensors.map((s) => (
              <SensorCard key={s.id} sensor={s} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

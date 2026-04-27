import { useMemo } from "react";
import { Bot, Battery, BatteryLow, BatteryFull, AlertTriangle, CheckCircle2, Clock, Activity } from "lucide-react";
import type { HomeyDeviceSnapshot, HomeyZone } from "@/server/homey";

/**
 * Panel som viser status for Gardena Sileno-gressklipper(e) i Homey.
 * Plukker enheter fra eksisterende Homey-snapshot — ingen ekstra API-kall.
 */

type MowerInfo = {
  id: string;
  name: string;
  zoneName: string;
  battery: number | null;
  charging: boolean | null;
  state: string | null; // f.eks. "MOWING", "CHARGING", "PARKED", "ERROR"
  activity: string | null;
  errorCode: string | null;
  lastErrorCode: string | null;
  online: boolean | null;
  available: boolean;
  // Alle øvrige capabilities — vises råt nederst hvis vi ikke kjenner dem.
  raw: Array<{ id: string; value: any }>;
};

function isMower(d: HomeyDeviceSnapshot): boolean {
  const name = (d.name ?? "").toLowerCase();
  const driver = (d.driverUri ?? "").toLowerCase();
  return (
    name.includes("sileno") ||
    name.includes("gardena") ||
    name.includes("gressklipper") ||
    name.includes("klipper") ||
    name.includes("mower") ||
    driver.includes("gardena") ||
    driver.includes("husqvarna") ||
    driver.includes("automower")
  );
}

function buildMowers(devices: HomeyDeviceSnapshot[], zones: HomeyZone[]): MowerInfo[] {
  const zoneById = new Map(zones.map((z) => [z.id, z.name]));
  const out: MowerInfo[] = [];
  for (const d of devices) {
    if (!isMower(d)) continue;

    const cap = (id: string) => d.capabilities[id]?.value;
    const findFirst = (pred: (id: string) => boolean) => {
      for (const [id, c] of Object.entries(d.capabilities)) {
        if (pred(id.toLowerCase())) return c.value;
      }
      return undefined;
    };

    const battery =
      typeof cap("measure_battery") === "number"
        ? (cap("measure_battery") as number)
        : null;
    const charging =
      typeof cap("charging") === "boolean"
        ? (cap("charging") as boolean)
        : null;
    const state =
      (typeof cap("mower_state") === "string" && (cap("mower_state") as string)) ||
      (typeof cap("state") === "string" && (cap("state") as string)) ||
      (typeof findFirst((id) => id.includes("state")) === "string"
        ? (findFirst((id) => id.includes("state")) as string)
        : null);
    const activity =
      (typeof cap("mower_activity") === "string" && (cap("mower_activity") as string)) ||
      (typeof findFirst((id) => id.includes("activity")) === "string"
        ? (findFirst((id) => id.includes("activity")) as string)
        : null);
    const errorCode =
      (typeof cap("mower_error") === "string" && (cap("mower_error") as string)) ||
      (typeof findFirst((id) => id.includes("error") && !id.includes("last"))
        === "string"
        ? (findFirst((id) => id.includes("error") && !id.includes("last")) as string)
        : null);
    const lastErrorCode =
      typeof findFirst((id) => id.includes("last") && id.includes("error")) === "string"
        ? (findFirst((id) => id.includes("last") && id.includes("error")) as string)
        : null;
    const online =
      typeof cap("alarm_connectivity") === "boolean"
        ? !(cap("alarm_connectivity") as boolean) // alarm = ikke tilkoblet
        : null;

    const raw = Object.entries(d.capabilities)
      .map(([id, c]) => ({ id, value: c.value }))
      .sort((a, b) => a.id.localeCompare(b.id));

    out.push({
      id: d.id,
      name: d.name,
      zoneName: d.zone ? zoneById.get(d.zone) ?? "Ukjent sal" : "Ukjent sal",
      battery,
      charging,
      state,
      activity,
      errorCode,
      lastErrorCode,
      online,
      available: d.available !== false,
      raw,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

const STATE_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "error" | "info" }> = {
  MOWING: { label: "Klipper", tone: "ok" },
  LEAVING: { label: "Forlater dokk", tone: "info" },
  GOING_HOME: { label: "På vei hjem", tone: "info" },
  CHARGING: { label: "Lader", tone: "info" },
  PARKED_TIMER: { label: "Parkert (timer)", tone: "info" },
  PARKED_PARK_SELECTED: { label: "Parkert (manuell)", tone: "info" },
  PARKED_AUTOTIMER: { label: "Parkert (auto)", tone: "info" },
  PAUSED: { label: "Pauset", tone: "warn" },
  OK_CUTTING: { label: "Klipper", tone: "ok" },
  OK_CUTTING_TIMER_OVERRIDDEN: { label: "Klipper (override)", tone: "ok" },
  OK_SEARCHING: { label: "Søker dokk", tone: "info" },
  OK_LEAVING: { label: "Forlater dokk", tone: "info" },
  OK_CHARGING: { label: "Lader", tone: "info" },
  PARKED_DAILY_LIMIT_REACHED: { label: "Dagens grense nådd", tone: "info" },
  ERROR: { label: "Feil", tone: "error" },
  OFF_DISABLED: { label: "Avslått", tone: "warn" },
  OFF_HATCH_OPEN: { label: "Luke åpen", tone: "warn" },
  UNAVAILABLE: { label: "Utilgjengelig", tone: "error" },
};

function prettifyState(state: string | null): { label: string; tone: "ok" | "warn" | "error" | "info" } | null {
  if (!state) return null;
  const key = state.toUpperCase();
  if (STATE_LABELS[key]) return STATE_LABELS[key];
  return { label: state.replaceAll("_", " ").toLowerCase(), tone: "info" };
}

function batteryIcon(level: number | null) {
  if (level === null) return Battery;
  if (level < 20) return BatteryLow;
  if (level >= 90) return BatteryFull;
  return Battery;
}

function toneClass(tone: "ok" | "warn" | "error" | "info"): string {
  switch (tone) {
    case "ok":
      return "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";
    case "warn":
      return "text-amber-400 border-amber-400/30 bg-amber-400/10";
    case "error":
      return "text-destructive border-destructive/30 bg-destructive/10";
    default:
      return "text-primary border-primary/30 bg-primary/10";
  }
}

export function MowerPanel({
  devices,
  zones,
}: {
  devices: HomeyDeviceSnapshot[];
  zones: HomeyZone[];
}) {
  const mowers = useMemo(() => buildMowers(devices, zones), [devices, zones]);

  if (mowers.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-12">
      <div className="ornate-divider mb-6 flex items-center justify-between gap-3">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Gressklipperne · Sileno
        </span>
        <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          {mowers.length} {mowers.length === 1 ? "enhet" : "enheter"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mowers.map((m) => {
          const stateInfo = prettifyState(m.state);
          const BatteryIcon = batteryIcon(m.battery);
          const hasError = !!m.errorCode && m.errorCode.toLowerCase() !== "no_message";

          return (
            <div key={m.id} className="panel rounded-lg p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Bot size={16} className="text-primary shrink-0" />
                    <h3 className="text-sm font-medium truncate">{m.name}</h3>
                  </div>
                  <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-1">
                    {m.zoneName}
                  </p>
                </div>
                {m.online === false || !m.available ? (
                  <span className="text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded border border-destructive/30 bg-destructive/10 text-destructive">
                    Offline
                  </span>
                ) : (
                  <span className="text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
                    Online
                  </span>
                )}
              </div>

              {stateInfo && (
                <div
                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded border ${toneClass(stateInfo.tone)}`}
                >
                  <Activity size={14} />
                  <span className="uppercase tracking-[0.15em]">{stateInfo.label}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <BatteryIcon
                    size={18}
                    className={
                      m.battery !== null && m.battery < 20
                        ? "text-amber-400"
                        : m.charging
                          ? "text-emerald-400"
                          : "text-primary/70"
                    }
                  />
                  <div>
                    <div className="text-sm tabular-nums">
                      {m.battery !== null ? `${Math.round(m.battery)}%` : "—"}
                    </div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                      {m.charging ? "Lader" : "Batteri"}
                    </div>
                  </div>
                </div>

                {m.activity && (
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-primary/70" />
                    <div>
                      <div className="text-xs">{m.activity.replaceAll("_", " ").toLowerCase()}</div>
                      <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                        Aktivitet
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {hasError && (
                <div className="flex items-start gap-2 text-xs text-destructive border border-destructive/30 bg-destructive/10 rounded px-3 py-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="uppercase tracking-[0.15em] text-[10px]">Feil</div>
                    <div className="mt-0.5">{m.errorCode}</div>
                  </div>
                </div>
              )}

              {!hasError && m.lastErrorCode && m.lastErrorCode.toLowerCase() !== "no_message" && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 size={14} className="mt-0.5 text-emerald-400 shrink-0" />
                  <div>
                    Sist feil: <span className="text-foreground">{m.lastErrorCode}</span>
                  </div>
                </div>
              )}

              {/* Detaljer / råverdier */}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer text-[10px] tracking-[0.25em] uppercase hover:text-primary">
                  Alle verdier ({m.raw.length})
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-1 max-h-48 overflow-auto pr-1">
                  {m.raw.map((c) => (
                    <div key={c.id} className="flex items-baseline justify-between gap-3 border-b border-border/30 py-1">
                      <span className="font-mono text-[10px] truncate">{c.id}</span>
                      <span className="tabular-nums text-foreground text-right truncate max-w-[55%]">
                        {c.value === null || c.value === undefined
                          ? "—"
                          : typeof c.value === "boolean"
                            ? c.value ? "ja" : "nei"
                            : typeof c.value === "number"
                              ? Number.isInteger(c.value)
                                ? c.value.toString()
                                : c.value.toFixed(2)
                              : String(c.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </section>
  );
}

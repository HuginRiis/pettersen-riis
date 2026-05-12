import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Wifi, WifiOff, Battery, RefreshCw, Mail, KeyRound, Play, Pause, Square, Home, Bell } from "lucide-react";
import {
  getRoborockSnapshot,
  sendRoborockCode,
  submitRoborockCode,
  loginRoborockWithPassword,
  sendRoborockCommand,
} from "@/server/roborock.functions";
import {
  getRoborockHomeySnapshot,
  setRoborockHomeyCapability,
  type RoborockHomeyCap,
  type RoborockHomeyDevice,
} from "@/server/homey";

type Snap = Awaited<ReturnType<typeof getRoborockSnapshot>>;
type HomeySnap = Awaited<ReturnType<typeof getRoborockHomeySnapshot>>;

const STATE_LABEL: Record<number, string> = {
  1: "Starter", 2: "Lader (avbrutt)", 3: "Inaktiv", 4: "Fjernstyrt", 5: "Renser",
  6: "Returnerer til dokk", 7: "Manuell modus", 8: "Lader", 9: "Lade-feil",
  10: "Pause", 11: "Sone-rens", 12: "Feil", 13: "Skrur av", 14: "Oppdaterer",
  15: "Dokker", 16: "Går til punkt", 17: "Sone-rens", 18: "Rom-rens",
  22: "Tømmer støvbeholder", 23: "Vasker mopp", 26: "Returnerer for å vaske mopp",
};

// S7 sugekraft-koder
const FAN_POWER_LABEL: Record<number, string> = {
  101: "Stille", 102: "Balansert", 103: "Turbo", 104: "Maks", 105: "Av",
  106: "Skånsom",
};

// S7 mopp-vannmengde
const WATER_BOX_LABEL: Record<number, string> = {
  200: "Av", 201: "Lite", 202: "Middels", 203: "Mye",
};

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function prettyCap(id: string, title?: string | null): string {
  if (title && title.length > 0) return title;
  return id
    .replace(/^button\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function CapControl({
  cap,
  busy,
  onSet,
}: {
  cap: RoborockHomeyCap;
  busy: boolean;
  onSet: (value: boolean | number | string) => void;
}) {
  // Knapp-kapabiliteter (button.*) — sender alltid true
  if (cap.id.startsWith("button.")) {
    if (!cap.setable) return null;
    return (
      <button
        onClick={() => onSet(true)}
        disabled={busy}
        className="text-xs inline-flex items-center gap-1 px-3 py-2 rounded border border-border hover:border-primary/60 disabled:opacity-50"
      >
        <Play size={11} /> {prettyCap(cap.id, cap.title)}
      </button>
    );
  }

  // Enum med predefinerte verdier — knapperad
  if (cap.type === "enum" && Array.isArray(cap.values) && cap.values.length > 0) {
    return (
      <div className="space-y-1">
        <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
          {prettyCap(cap.id, cap.title)}
        </div>
        <div className="flex flex-wrap gap-1">
          {cap.values.map((v) => {
            const active = String(cap.value) === String(v.id);
            return (
              <button
                key={v.id}
                onClick={() => cap.setable && onSet(v.id)}
                disabled={busy || !cap.setable}
                className={`text-[11px] px-2 py-1 rounded border ${
                  active
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border hover:border-primary/60"
                } disabled:opacity-50`}
              >
                {v.title ?? v.id}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Boolean — toggle
  if (cap.type === "boolean") {
    const on = cap.value === true;
    if (!cap.setable) {
      return (
        <div className="text-xs text-muted-foreground">
          {prettyCap(cap.id, cap.title)}: <span className="text-foreground">{on ? "På" : "Av"}</span>
        </div>
      );
    }
    return (
      <button
        onClick={() => onSet(!on)}
        disabled={busy}
        className={`text-xs inline-flex items-center gap-2 px-3 py-2 rounded border ${
          on ? "border-primary text-primary bg-primary/10" : "border-border hover:border-primary/60"
        } disabled:opacity-50`}
      >
        {prettyCap(cap.id, cap.title)}: {on ? "På" : "Av"}
      </button>
    );
  }

  // Tall med min/max — slider
  if (cap.type === "number" && typeof cap.min === "number" && typeof cap.max === "number") {
    const value = typeof cap.value === "number" ? cap.value : cap.min;
    if (!cap.setable) {
      return (
        <div className="text-xs text-muted-foreground">
          {prettyCap(cap.id, cap.title)}:{" "}
          <span className="text-foreground">
            {value}
            {cap.units ?? ""}
          </span>
        </div>
      );
    }
    return (
      <label className="block text-xs space-y-1">
        <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
          {prettyCap(cap.id, cap.title)}: <span className="text-foreground">{value}{cap.units ?? ""}</span>
        </span>
        <input
          type="range"
          min={cap.min}
          max={cap.max}
          step={cap.step ?? 1}
          defaultValue={value}
          disabled={busy}
          onMouseUp={(e) => onSet(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => onSet(Number((e.target as HTMLInputElement).value))}
          className="w-full"
        />
      </label>
    );
  }

  // Fallback: bare vis verdien
  return (
    <div className="text-xs text-muted-foreground">
      {prettyCap(cap.id, cap.title)}:{" "}
      <span className="text-foreground">{String(cap.value ?? "—")}{cap.units ?? ""}</span>
    </div>
  );
}

const CLOUD_COMMANDS: Array<{ method: string; label: string; icon: typeof Play; params?: any[] }> = [
  { method: "app_start", label: "Start", icon: Play },
  { method: "app_pause", label: "Pause", icon: Pause },
  { method: "app_stop", label: "Stopp", icon: Square },
  { method: "app_charge", label: "Til dokk", icon: Home },
  { method: "find_me", label: "Finn", icon: Bell, params: [{}] },
];

function CloudControls({ duid, onResult }: { duid: string; onResult: (msg: string) => void }) {
  const sendCmd = useServerFn(sendRoborockCommand);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (method: string, params?: any[]) => {
    setBusy(method);
    try {
      const r = await sendCmd({ data: { duid, method, params: params ?? [] } });
      if (r.ok) {
        onResult(`✓ ${method} sendt${r.acked ? " (bekreftet)" : ""}`);
      } else {
        onResult(`✗ ${method}: ${r.error ?? "ukjent feil"}`);
      }
    } catch (e: any) {
      onResult(`✗ ${method}: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {CLOUD_COMMANDS.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.method}
            onClick={() => run(c.method, c.params)}
            disabled={busy !== null}
            className="text-xs inline-flex items-center gap-1 px-3 py-2 rounded border border-border hover:border-primary/60 disabled:opacity-50"
          >
            {busy === c.method ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function HomeyDeviceCard({
  device,
  onSet,
  busyCap,
}: {
  device: RoborockHomeyDevice;
  onSet: (capId: string, value: boolean | number | string) => void;
  busyCap: string | null;
}) {
  const buttons = device.capabilities.filter((c) => c.id.startsWith("button.") && c.setable);
  const enums = device.capabilities.filter((c) => !c.id.startsWith("button.") && c.type === "enum");
  const numbers = device.capabilities.filter((c) => !c.id.startsWith("button.") && c.type === "number");
  const booleans = device.capabilities.filter((c) => !c.id.startsWith("button.") && c.type === "boolean");
  const battery = numbers.find((c) => c.id === "measure_battery");

  // Vennlig oppsummering: battery, state, fan_power, water_box, hovedbørste, sidebørste, filter
  const findCap = (pred: (id: string) => boolean) =>
    device.capabilities.find((c) => pred(c.id.toLowerCase()));
  const stateCap = findCap((id) => id.includes("vacuumcleaner_state") || id === "state");
  const fanCap = findCap((id) => id.includes("fan_power") || id.includes("fan_speed"));
  const waterCap = findCap((id) => id.includes("water_box") || id.includes("mop"));
  const mainCap = findCap((id) => id.includes("main_brush"));
  const sideCap = findCap((id) => id.includes("side_brush"));
  const filterCap = findCap((id) => id.includes("filter") && (id.includes("life") || id.includes("consumable") || id.includes("work")));

  const labelOf = (cap: typeof stateCap) => {
    if (!cap) return null;
    if (cap.type === "enum" && Array.isArray(cap.values)) {
      const match = cap.values.find((v) => String(v.id) === String(cap.value));
      return match?.title ?? String(cap.value ?? "—");
    }
    if (typeof cap.value === "number") return `${cap.value}${cap.units ?? ""}`;
    if (cap.value == null || cap.value === "") return "—";
    return String(cap.value);
  };

  const summary: Array<{ k: string; v: string | null }> = [
    { k: "Batteri", v: typeof battery?.value === "number" ? `${battery.value}%` : null },
    { k: "Tilstand", v: labelOf(stateCap) },
    { k: "Sug", v: labelOf(fanCap) },
    { k: "Mopp", v: labelOf(waterCap) },
    { k: "Hovedbørste", v: labelOf(mainCap) },
    { k: "Sidebørste", v: labelOf(sideCap) },
    { k: "Filter", v: labelOf(filterCap) },
  ].filter((x) => x.v != null && x.v !== "—");

  return (
    <div className="rounded-lg border border-border bg-card/30 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground flex-1 truncate">{device.name}</span>
        {device.available ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-primary">
            <Wifi size={10} /> ONLINE
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <WifiOff size={10} /> OFFLINE
          </span>
        )}
        {battery && typeof battery.value === "number" && (
          <span className="inline-flex items-center gap-1 text-[10px] text-foreground">
            <Battery size={11} className="text-primary" /> {battery.value}%
          </span>
        )}
      </div>
      {device.zoneName && (
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground -mt-2">
          {device.zoneName}
        </div>
      )}

      {summary.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {summary.map((s) => (
            <span key={s.k} className="text-muted-foreground truncate">
              {s.k}: <span className="text-foreground">{s.v}</span>
            </span>
          ))}
        </div>
      )}

      {buttons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {buttons.map((c) => (
            <CapControl key={c.id} cap={c} busy={busyCap === c.id} onSet={(v) => onSet(c.id, v)} />
          ))}
        </div>
      )}

      {enums.length > 0 && (
        <div className="space-y-2">
          {enums.map((c) => (
            <CapControl key={c.id} cap={c} busy={busyCap === c.id} onSet={(v) => onSet(c.id, v)} />
          ))}
        </div>
      )}

      {numbers.filter((c) => c.id !== "measure_battery").length > 0 && (
        <div className="space-y-2">
          {numbers
            .filter((c) => c.id !== "measure_battery")
            .map((c) => (
              <CapControl key={c.id} cap={c} busy={busyCap === c.id} onSet={(v) => onSet(c.id, v)} />
            ))}
        </div>
      )}

      {booleans.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {booleans.map((c) => (
            <CapControl key={c.id} cap={c} busy={busyCap === c.id} onSet={(v) => onSet(c.id, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RoborockPanel() {
  const fetchSnap = useServerFn(getRoborockSnapshot);
  const sendCode = useServerFn(sendRoborockCode);
  const submitCode = useServerFn(submitRoborockCode);
  const passwordLogin = useServerFn(loginRoborockWithPassword);
  const fetchHomey = useServerFn(getRoborockHomeySnapshot);
  const setCap = useServerFn(setRoborockHomeyCapability);

  const [snap, setSnap] = useState<Snap | null>(null);
  const [homey, setHomey] = useState<HomeySnap | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"send" | "verify" | "password" | null>(null);
  const [busyCap, setBusyCap] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([fetchSnap(), fetchHomey()]);
      setSnap(s);
      setHomey(h);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSend = async () => {
    setBusy("send");
    setInfo(null);
    const r = await sendCode();
    setBusy(null);
    setInfo(r.ok ? "Kode sendt på e-post. Sjekk innboksen." : `Feil: ${r.error}`);
  };

  const onVerify = async () => {
    if (!code.trim()) return;
    setBusy("verify");
    setInfo(null);
    const r = await submitCode({ data: { code } });
    setBusy(null);
    if (r.ok) {
      setInfo("Logget inn ✓");
      setCode("");
      await load();
    } else {
      setInfo(`Feil: ${r.error}`);
    }
  };

  const onPasswordLogin = async () => {
    setBusy("password");
    setInfo(null);
    const r = await passwordLogin();
    setBusy(null);
    if (r.ok) { setInfo("Logget inn med passord ✓"); await load(); }
    else setInfo(`Feil: ${r.error}`);
  };

  const onSetCap = async (deviceId: string, capability: string, value: boolean | number | string) => {
    setBusyCap(`${deviceId}:${capability}`);
    setInfo(null);
    const r = await setCap({ data: { deviceId, capability, value } });
    setBusyCap(null);
    if (!r.ok) setInfo(`Kommandoen feilet: ${r.error}`);
    else setTimeout(() => fetchHomey().then(setHomey), 1500);
  };

  const homeyDevices = useMemo(
    () => (homey?.ok ? homey.devices : []),
    [homey],
  );

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-primary" />
          <h3 className="text-foreground font-semibold flex-1">Roborock</h3>
          <button
            onClick={load}
            disabled={loading}
            className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary/60 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Oppdater
          </button>
        </div>

        {loading && !snap && !homey && (
          <div className="text-xs text-muted-foreground">Henter status…</div>
        )}

        {/* Homey-styrte enheter (full kontroll) */}
        {homeyDevices.length > 0 && (
          <div className="space-y-2">
            {homeyDevices.map((d) => (
              <HomeyDeviceCard
                key={d.id}
                device={d}
                busyCap={busyCap?.startsWith(`${d.id}:`) ? busyCap.slice(d.id.length + 1) : null}
                onSet={(capId, value) => onSetCap(d.id, capId, value)}
              />
            ))}
          </div>
        )}

        {/* Hint hvis Homey-snapshot er ok men ingen vakuum-enheter funnet */}
        {homey?.ok && homeyDevices.length === 0 && (
          <div className="text-[11px] text-muted-foreground bg-card/30 border border-border rounded p-2">
            Fant ingen støvsuger-enheter i Homey. Installer Roborock-appen i Homey og legg til begge S7-ene
            der, så dukker de opp her med fulle kontroller (start/stopp/dokk/sugehastighet/mopp).
          </div>
        )}

        {cloudMsg && (
          <div className="text-[11px] px-3 py-2 rounded border border-border bg-card/40 text-foreground">
            {cloudMsg}
          </div>
        )}

        {/* Sky-snapshot (lese-kanal) — vis alltid for enheter Homey ikke har */}
        {snap?.ok && snap.devices.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Status fra Roborock-skyen
            </div>
            {snap.devices.map((d) => {
              const status = (d.attribute ?? {}) as Record<string, unknown>;
              // Roborock S7 DPS-koder (numeriske) er ofte mer fersk enn de navngitte
              // 120=error, 121=state, 122=battery, 123=fan_power, 124=water_box_mode,
              // 125=main_brush_life, 126=side_brush_life, 127=filter_life
              const state = num(status[121]) ?? num(status.state);
              const battery = num(status[122]) ?? num(status.battery);
              const fan = num(status[123]) ?? num(status.fan_power);
              const water = num(status[124]) ?? num(status.water_box_mode);
              const main = num(status[125]) ?? num(status.main_brush_life);
              const side = num(status[126]) ?? num(status.side_brush_life);
              const filter = num(status[127]) ?? num(status.filter_life);
              const errorCode = num(status[120]) ?? num(status.error_code);
              const allKeys = Object.keys(status).sort((a, b) => {
                const an = Number(a), bn = Number(b);
                if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
                if (!Number.isNaN(an)) return -1;
                if (!Number.isNaN(bn)) return 1;
                return a.localeCompare(b);
              });
              return (
                <div key={d.duid} className="rounded-lg border border-border bg-card/30 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground flex-1 truncate">{d.name}</span>
                    {d.online ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                        <Wifi size={10} /> ONLINE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <WifiOff size={10} /> OFFLINE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mt-1">
                    {d.productName ?? "Roborock"}{d.fv ? ` · v${d.fv}` : ""}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5 break-all">
                    DUID: {d.duid}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
                    {battery != null && (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <Battery size={12} className="text-primary" /> {battery}%
                      </span>
                    )}
                    {state != null && (
                      <span className="text-muted-foreground">
                        Tilstand:{" "}
                        <span className="text-foreground">{STATE_LABEL[state] ?? `kode ${state}`}</span>
                      </span>
                    )}
                    {fan != null && (
                      <span className="text-muted-foreground">
                        Sug: <span className="text-foreground">{FAN_POWER_LABEL[fan] ?? `kode ${fan}`}</span>
                      </span>
                    )}
                    {water != null && (
                      <span className="text-muted-foreground">
                        Mopp: <span className="text-foreground">{WATER_BOX_LABEL[water] ?? `kode ${water}`}</span>
                      </span>
                    )}
                    {main != null && (
                      <span className="text-muted-foreground">
                        Hovedbørste: <span className="text-foreground">{main}%</span>
                      </span>
                    )}
                    {side != null && (
                      <span className="text-muted-foreground">
                        Sidebørste: <span className="text-foreground">{side}%</span>
                      </span>
                    )}
                    {filter != null && (
                      <span className="text-muted-foreground">
                        Filter: <span className="text-foreground">{filter}%</span>
                      </span>
                    )}
                    {errorCode != null && errorCode !== 0 && (
                      <span className="text-muted-foreground">
                        Feilkode: <span className="text-destructive">{errorCode}</span>
                      </span>
                    )}
                  </div>
                  {allKeys.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground cursor-pointer hover:text-foreground">
                        Alle felter ({allKeys.length})
                      </summary>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
                        {allKeys.map((k) => (
                          <div key={k} className="truncate">
                            <span className="text-muted-foreground">{k}:</span>{" "}
                            <span className="text-foreground">{String(status[k] ?? "—")}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <CloudControls duid={d.duid} onResult={(m) => setCloudMsg(m)} />
                </div>
              );
            })}
          </div>
        )}

        {/* Innloggings-flyt for Roborock-skyen — kun hvis vi mangler den OG ingen Homey-enheter */}
        {snap && !snap.ok && snap.needsLogin && homeyDevices.length === 0 && (
          <div className="space-y-2 pt-1 border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              Eller logg inn på Roborock-skyen for å se status (uten kontroll-knapper):
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={onPasswordLogin}
                disabled={busy !== null}
                className="text-xs inline-flex items-center gap-2 px-3 py-2 rounded border border-primary/60 text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {busy === "password" ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                Logg inn med passord
              </button>
              <button
                onClick={onSend}
                disabled={busy !== null}
                className="text-xs inline-flex items-center gap-2 px-3 py-2 rounded border border-border hover:border-primary/60 disabled:opacity-50"
              >
                {busy === "send" ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                Send kode på e-post
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Kode fra e-post"
                className="flex-1 bg-card/30 border border-border rounded px-2 py-2 text-sm"
              />
              <button
                onClick={onVerify}
                disabled={busy !== null || !code.trim()}
                className="text-xs inline-flex items-center gap-2 px-3 py-2 rounded border border-border hover:border-primary/60 disabled:opacity-50"
              >
                {busy === "verify" ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                Logg inn
              </button>
            </div>
          </div>
        )}

        {/* Feilmeldinger */}
        {homey && !homey.ok && homey.error && homeyDevices.length === 0 && (
          <div className="text-[11px] text-muted-foreground">
            Homey: {homey.error}
          </div>
        )}
        {info && <p className="text-[11px] text-muted-foreground">{info}</p>}
      </article>
    </section>
  );
}

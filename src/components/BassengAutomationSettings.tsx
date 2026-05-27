import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Waves, Loader2, Play, Snowflake, Flame, Wind, Power, Plug, Thermometer, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getHomeySnapshot, setLivingRoomDeviceCapability } from "@/server/homey";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STORAGE_KEY = "basseng_automation";

type Mode = "heat" | "cool" | "auto";

type Config = {
  enabled: boolean;
  stuaTempThreshold: number;       // hvis stuetemp < dette → trigge varme
  stuaTempHighEnabled: boolean;    // også trigge på høy temp?
  stuaTempHighThreshold: number;   // hvis stuetemp > dette → trigge kjøl
  neutralEnabled: boolean;         // trigge tilbakestilling i nøytralt sjikt
  neutralMin: number;              // nedre grense for nøytralt sjikt
  neutralMax: number;              // øvre grense for nøytralt sjikt
  neutralDelayMinutes: number;     // min minutter siden basseng ble skrudd av
  stuaDeviceId: string | null;     // sensor for stue
  bassengSwitchId: string | null;  // bryter for basseng som skal skrus av
  wattCheckEnabled: boolean;       // sjekk watt før vi skrur av?
  wattMax: number;                 // skru bare av når W < wattMax
  wattSensorId: string | null;     // hvor watt leses fra (kan være samme som bryter)
  melcloudDeviceId: string | null; // varmepumpa
  melcloudMode: Mode;              // modus ved kald trigger
  melcloudTargetTemp: number;      // måltemp ved kald trigger
  melcloudCoolMode: Mode;          // modus ved varm trigger
  melcloudCoolTargetTemp: number;  // måltemp ved varm trigger
  activeFrom: string;              // HH:MM (Oslo)
  activeTo: string;
  lastBassengOffAt: string | null; // ISO-tid sist basseng ble skrudd av
};

const DEFAULT_CONFIG: Config = {
  enabled: false,
  stuaTempThreshold: 18,
  stuaTempHighEnabled: false,
  stuaTempHighThreshold: 26,
  neutralEnabled: false,
  neutralMin: 22,
  neutralMax: 24,
  neutralDelayMinutes: 60,
  stuaDeviceId: null,
  bassengSwitchId: null,
  wattCheckEnabled: true,
  wattMax: 30,
  wattSensorId: null,
  melcloudDeviceId: null,
  melcloudMode: "heat",
  melcloudTargetTemp: 21,
  melcloudCoolMode: "cool",
  melcloudCoolTargetTemp: 22,
  activeFrom: "00:00",
  activeTo: "23:59",
  lastBassengOffAt: null,
};

type DeviceLite = {
  id: string;
  name: string;
  zone: string;
  hasOnoff: boolean;
  hasMeasureTemp: boolean;
  hasMeasurePower: boolean;
  hasTargetTemp: boolean;
  hasThermostatMode: boolean;
};

function inWindow(now: Date, from: string, to: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false });
  const [hh, mm] = fmt.format(now).split(":").map(Number);
  const cur = hh * 60 + mm;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const f = fh * 60 + fm;
  const t = th * 60 + tm;
  if (f <= t) return cur >= f && cur <= t;
  return cur >= f || cur <= t;
}

export function BassengAutomationSettings() {
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const fetchSnap = useServerFn(getHomeySnapshot);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Last config
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("notification_settings")
        .select("id, value")
        .eq("key", STORAGE_KEY)
        .maybeSingle();
      if (data) {
        setRecordId(data.id);
        setConfig({ ...DEFAULT_CONFIG, ...(data.value as Partial<Config>) });
      }
      setLoading(false);
    })();
  }, []);

  // Last enheter
  useEffect(() => {
    (async () => {
      try {
        const snap: any = await fetchSnap();
        const zoneById = new Map<string, string>(
          (snap.zones ?? []).map((z: any) => [z.id, z.name ?? ""]),
        );
        const list: DeviceLite[] = (snap.devices ?? []).map((d: any) => ({
          id: d.id,
          name: d.name ?? "(uten navn)",
          zone: d.zone ? zoneById.get(d.zone) ?? "" : "",
          hasOnoff: !!d.capabilities?.["onoff"],
          hasMeasureTemp: typeof d.capabilities?.["measure_temperature"]?.value === "number",
          hasMeasurePower: typeof d.capabilities?.["measure_power"]?.value === "number",
          hasTargetTemp: !!d.capabilities?.["target_temperature"],
          hasThermostatMode: !!d.capabilities?.["thermostat_mode"],
        }));
        list.sort((a, b) => `${a.zone} ${a.name}`.localeCompare(`${b.zone} ${b.name}`, "nb"));
        setDevices(list);
      } catch {
        // stille
      }
    })();
  }, [fetchSnap]);

  const tempSensors = useMemo(() => devices.filter((d) => d.hasMeasureTemp), [devices]);
  const switches = useMemo(() => devices.filter((d) => d.hasOnoff), [devices]);
  const wattSensors = useMemo(() => devices.filter((d) => d.hasMeasurePower), [devices]);
  const thermostats = useMemo(
    () => devices.filter((d) => d.hasTargetTemp || d.hasThermostatMode || d.hasOnoff),
    [devices],
  );

  const save = async (patch: Partial<Config>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    setBusy("save");
    try {
      if (recordId) {
        await supabase
          .from("notification_settings")
          .update({ value: next as never, updated_at: new Date().toISOString() })
          .eq("id", recordId);
      } else {
        const { data } = await supabase
          .from("notification_settings")
          .insert({ key: STORAGE_KEY, value: next as never })
          .select("id")
          .maybeSingle();
        if (data?.id) setRecordId(data.id);
      }
    } finally {
      setBusy(null);
    }
  };

  const runNow = async () => {
    setBusy("run");
    setMsg(null);
    try {
      if (!inWindow(new Date(), config.activeFrom, config.activeTo)) {
        setMsg("Utenfor aktivt tidsrom — ingen handling.");
        return;
      }
      const snap: any = await fetchSnap();
      const find = (id: string | null) => (id ? snap.devices.find((d: any) => d.id === id) : null);

      const stua = find(config.stuaDeviceId);
      const stuaTemp = stua?.capabilities?.["measure_temperature"]?.value;
      if (typeof stuaTemp !== "number") {
        setMsg("Fant ikke stuetemperatur.");
        return;
      }
      let trigger: "cold" | "hot" | null = null;
      if (stuaTemp < config.stuaTempThreshold) trigger = "cold";
      else if (config.stuaTempHighEnabled && stuaTemp > config.stuaTempHighThreshold) trigger = "hot";

      if (!trigger) {
        const range = config.stuaTempHighEnabled
          ? `${config.stuaTempThreshold}°–${config.stuaTempHighThreshold}°`
          : `≥ ${config.stuaTempThreshold}°`;
        setMsg(`Stua er ${stuaTemp.toFixed(1)}° (${range}). Ingen handling.`);
        return;
      }

      const mode = trigger === "cold" ? config.melcloudMode : config.melcloudCoolMode;
      const targetTemp = trigger === "cold" ? config.melcloudTargetTemp : config.melcloudCoolTargetTemp;
      const arrow = trigger === "cold"
        ? `< ${config.stuaTempThreshold}° → varme`
        : `> ${config.stuaTempHighThreshold}° → kjøl`;
      const log: string[] = [`Stua: ${stuaTemp.toFixed(1)}° ${arrow}.`];

      // Sjekk watt før vi skrur av bryter (valgfritt)
      if (config.wattCheckEnabled) {
        const wattSrc = find(config.wattSensorId) ?? find(config.bassengSwitchId);
        const watt = wattSrc?.capabilities?.["measure_power"]?.value;
        if (typeof watt === "number" && watt >= config.wattMax) {
          setMsg(`${log.join(" ")} Basseng bruker ${watt.toFixed(0)} W (≥ ${config.wattMax}). Avbryter.`);
          return;
        }
        log.push(`Watt: ${typeof watt === "number" ? `${watt.toFixed(0)} W ok` : "ukjent"}.`);
      } else {
        log.push("Watt-sjekk: av.");
      }

      // Skru av basseng-bryter
      if (config.bassengSwitchId) {
        const r = await setCap({ data: { deviceId: config.bassengSwitchId, capability: "onoff", value: false } });
        log.push(r.ok ? "Basseng-bryter AV ✓" : `Bryter feilet: ${r.error}`);
      }

      // Skru på varmepumpa
      if (config.melcloudDeviceId) {
        const md = find(config.melcloudDeviceId);
        if (md?.capabilities?.["onoff"]) {
          const r = await setCap({ data: { deviceId: config.melcloudDeviceId, capability: "onoff", value: true } });
          log.push(r.ok ? "Varmepumpe PÅ ✓" : `Varmepumpe på-feil: ${r.error}`);
        }
        if (md?.capabilities?.["thermostat_mode"]) {
          const r = await setCap({ data: { deviceId: config.melcloudDeviceId, capability: "thermostat_mode", value: mode } });
          log.push(r.ok ? `Modus: ${mode} ✓` : `Modus-feil: ${r.error}`);
        }
        if (md?.capabilities?.["target_temperature"]) {
          const r = await setCap({ data: { deviceId: config.melcloudDeviceId, capability: "target_temperature", value: targetTemp } });
          log.push(r.ok ? `${targetTemp}° ✓` : `Temp-feil: ${r.error}`);
        }
      }

      setMsg(log.join(" · "));
    } catch (e: any) {
      setMsg(`Feil: ${e?.message ?? "ukjent"}`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-muted-foreground text-xs">Laster…</p>;

  const deviceOption = (d: DeviceLite) => (
    <SelectItem key={d.id} value={d.id}>
      {d.name}{d.zone ? ` · ${d.zone}` : ""}
    </SelectItem>
  );

  return (
    <article className="panel rounded-lg p-4 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Waves size={16} className="text-[var(--gold)] shrink-0" />
          <span className="text-display tracking-[0.3em] uppercase text-sm text-primary truncate">
            Basseng-automatikk
          </span>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => void save({ enabled: e.target.checked })}
            className="accent-[var(--gold)]"
          />
          <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Aktiv</span>
        </label>
      </header>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Når <strong>stuetemperaturen</strong> går under (eller over) terskel, og basseng-bryteren bruker lite strøm,
        skrur vi basseng-bryteren <strong>av</strong> og slår på varmepumpa i passende modus.
      </p>

      {/* Stue + terskel */}
      <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
        <label className="space-y-1.5">
          <span className="text-xs flex items-center gap-1.5"><Flame size={12} className="text-orange-400" /> Trigg varme når stua &lt;</span>
          <input
            type="number" step="0.5"
            value={config.stuaTempThreshold}
            disabled={!config.enabled}
            onChange={(e) => void save({ stuaTempThreshold: Number(e.target.value) })}
            className="w-full bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs flex items-center gap-1.5"><Thermometer size={12} className="text-sky-300" /> Stue-sensor</span>
          <Select value={config.stuaDeviceId ?? ""} disabled={!config.enabled} onValueChange={(v) => void save({ stuaDeviceId: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Velg…" /></SelectTrigger>
            <SelectContent>{tempSensors.map(deviceOption)}</SelectContent>
          </Select>
        </label>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.stuaTempHighEnabled}
              disabled={!config.enabled}
              onChange={(e) => void save({ stuaTempHighEnabled: e.target.checked })}
              className="accent-[var(--gold)]"
            />
            <span className="text-xs flex items-center gap-1.5">
              <Snowflake size={12} className="text-cyan-300" /> Trigg kjøl når stua &gt;
            </span>
          </label>
          <input
            type="number" step="0.5"
            value={config.stuaTempHighThreshold}
            disabled={!config.enabled || !config.stuaTempHighEnabled}
            onChange={(e) => void save({ stuaTempHighThreshold: Number(e.target.value) })}
            className="w-full bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums disabled:opacity-50"
          />
        </div>
      </div>

      {/* Basseng-bryter + watt */}
      <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
        <label className="space-y-1.5">
          <span className="text-xs flex items-center gap-1.5"><Power size={12} className="text-emerald-400" /> Basseng-bryter (skrus av)</span>
          <Select value={config.bassengSwitchId ?? ""} disabled={!config.enabled} onValueChange={(v) => void save({ bassengSwitchId: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Velg…" /></SelectTrigger>
            <SelectContent>{switches.map(deviceOption)}</SelectContent>
          </Select>
        </label>
        <div className="space-y-1.5">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.wattCheckEnabled}
              disabled={!config.enabled}
              onChange={(e) => void save({ wattCheckEnabled: e.target.checked })}
              className="accent-[var(--gold)]"
            />
            <span className="text-xs flex items-center gap-1.5">
              <Plug size={12} className="text-amber-300" /> Sjekk watt før av
            </span>
          </label>
          <Select value={config.wattSensorId ?? ""} disabled={!config.enabled || !config.wattCheckEnabled} onValueChange={(v) => void save({ wattSensorId: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Samme som bryter…" /></SelectTrigger>
            <SelectContent>{wattSensors.map(deviceOption)}</SelectContent>
          </Select>
        </div>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs">Skru bare av hvis watt &lt; (W)</span>
          <input
            type="number"
            value={config.wattMax}
            disabled={!config.enabled || !config.wattCheckEnabled}
            onChange={(e) => void save({ wattMax: Number(e.target.value) })}
            className="w-full bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums disabled:opacity-50"
          />
        </label>
      </div>

      {/* Varmepumpe */}
      <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-xs flex items-center gap-1.5"><Wind size={12} className="text-cyan-300" /> Varmepumpe (MELCloud)</span>
          <Select value={config.melcloudDeviceId ?? ""} disabled={!config.enabled} onValueChange={(v) => void save({ melcloudDeviceId: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Velg enhet…" /></SelectTrigger>
            <SelectContent>{thermostats.map(deviceOption)}</SelectContent>
          </Select>
        </label>
        <div className="space-y-1.5">
          <span className="text-xs flex items-center gap-1.5"><Flame size={12} className="text-orange-400" /> Modus ved kald trigger</span>
          <div className="inline-flex rounded-full border border-border/60 overflow-hidden w-full">
            {(["heat", "cool", "auto"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!config.enabled}
                onClick={() => void save({ melcloudMode: m })}
                className={`flex-1 px-3 py-1 text-xs inline-flex items-center justify-center gap-1 ${
                  config.melcloudMode === m
                    ? "bg-[var(--gold)]/20 text-[var(--gold)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "heat" && <Flame size={12} />}
                {m === "cool" && <Snowflake size={12} />}
                {m === "auto" && <Wind size={12} />}
                {m === "heat" ? "Varme" : m === "cool" ? "Kjøl" : "Auto"}
              </button>
            ))}
          </div>
        </div>
        <label className="space-y-1.5">
          <span className="text-xs">Måltemp ved kald °C</span>
          <input
            type="number" step="0.5"
            value={config.melcloudTargetTemp}
            disabled={!config.enabled}
            onChange={(e) => void save({ melcloudTargetTemp: Number(e.target.value) })}
            className="w-full bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
          />
        </label>
        <div className="space-y-1.5">
          <span className="text-xs flex items-center gap-1.5"><Snowflake size={12} className="text-cyan-300" /> Modus ved varm trigger</span>
          <div className="inline-flex rounded-full border border-border/60 overflow-hidden w-full">
            {(["heat", "cool", "auto"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!config.enabled || !config.stuaTempHighEnabled}
                onClick={() => void save({ melcloudCoolMode: m })}
                className={`flex-1 px-3 py-1 text-xs inline-flex items-center justify-center gap-1 ${
                  config.melcloudCoolMode === m
                    ? "bg-[var(--gold)]/20 text-[var(--gold)]"
                    : "text-muted-foreground hover:text-foreground"
                } disabled:opacity-50`}
              >
                {m === "heat" && <Flame size={12} />}
                {m === "cool" && <Snowflake size={12} />}
                {m === "auto" && <Wind size={12} />}
                {m === "heat" ? "Varme" : m === "cool" ? "Kjøl" : "Auto"}
              </button>
            ))}
          </div>
        </div>
        <label className="space-y-1.5">
          <span className="text-xs">Måltemp ved varm °C</span>
          <input
            type="number" step="0.5"
            value={config.melcloudCoolTargetTemp}
            disabled={!config.enabled || !config.stuaTempHighEnabled}
            onChange={(e) => void save({ melcloudCoolTargetTemp: Number(e.target.value) })}
            className="w-full bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums disabled:opacity-50"
          />
        </label>
      </div>

      {/* Tidsrom */}
      <div className="pt-2 border-t border-border/40 space-y-2">
        <div className="inline-flex items-center gap-2 text-sm">
          <Clock size={14} className="text-[var(--gold)]" />
          <span>Aktivt tidsrom (Oslo)</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={config.activeFrom}
            disabled={!config.enabled}
            onChange={(e) => void save({ activeFrom: e.target.value })}
            className="bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
          />
          <span className="text-xs text-muted-foreground">til</span>
          <input
            type="time"
            value={config.activeTo}
            disabled={!config.enabled}
            onChange={(e) => void save({ activeTo: e.target.value })}
            className="bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground">
          {busy === "save" ? "Lagrer…" : "Lagres automatisk"}
        </span>
        <button
          type="button"
          onClick={runNow}
          disabled={busy !== null || !config.enabled}
          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-border/60 hover:border-primary/60 hover:text-primary transition disabled:opacity-50"
        >
          {busy === "run" ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Kjør sjekk nå
        </button>
      </div>

      {msg && <p className="text-[11px] text-muted-foreground leading-relaxed">{msg}</p>}
    </article>
  );
}

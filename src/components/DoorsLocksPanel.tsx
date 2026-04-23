import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getDoorsLocksSnapshot,
  getHomeAlarmStatus,
  setHomeAlarmState,
  type DoorOrLockEntry,
  type DoorsLocksResult,
  type HomeAlarmStatusResult,
  type HomeAlarmState,
} from "@/server/homey";
import { supabase } from "@/integrations/supabase/client";
import { getStoredWho, setStoredWho, type Who } from "@/lib/push-client";
import { DoorClosed, DoorOpen, Lock, Unlock, Activity, ShieldAlert, BatteryLow, Plus, Minus, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const REFRESH_MS = 30_000;
const ALARM_REFRESH_MS = 20_000;

type AlarmLogRow = {
  id: string;
  state: string;
  who: string;
  changed_at: string;
};

const WHO_OPTIONS: Who[] = ["Alle", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"];

function ago(iso: string | null): string {
  if (!iso) return "ukjent";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "nå";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "nå";
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} t siden`;
  return `${Math.round(hrs / 24)} d siden`;
}

function brandSigil(brand: DoorOrLockEntry["brand"]) {
  if (brand === "yale") return "🦅"; // Yale Doorman — kongelig ørn
  if (brand === "verisure") return "🛡"; // Verisure — vaktens skjold
  return "✦";
}

function brandHouse(brand: DoorOrLockEntry["brand"]): string {
  if (brand === "yale") return "Yale Doorman";
  if (brand === "verisure") return "Verisure";
  return "Vaktens utstyr";
}

function LockRow({ entry }: { entry: DoorOrLockEntry }) {
  const locked = entry.locked === true;
  const unknown = entry.locked == null;
  const Icon = unknown ? Lock : locked ? Lock : Unlock;
  const tone = unknown
    ? "text-muted-foreground"
    : locked
      ? "text-emerald-400"
      : "text-destructive";
  const status = unknown
    ? "Ukjent"
    : locked
      ? "Lukket og forseglet"
      : "Porten står åpen";
  return (
    <li className="rounded-md border border-border bg-background/40 p-3 flex items-start gap-3">
      <Icon size={18} className={tone} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground font-semibold truncate">
            {entry.name}
          </span>
          <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            {entry.zoneName}
          </span>
          <span className="text-[10px] text-muted-foreground" title={brandHouse(entry.brand)}>
            {brandSigil(entry.brand)}
          </span>
        </div>
        <div className={`text-[11px] tracking-[0.15em] uppercase mt-0.5 ${tone}`}>
          « {status} »
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
          <span>↻ {ago(entry.lastUpdated)}</span>
          {typeof entry.battery === "number" && (
            <span
              className={
                entry.battery < 20 ? "text-destructive" : "text-muted-foreground"
              }
            >
              🔋 {Math.round(entry.battery)}%
            </span>
          )}
          {entry.tamper && (
            <span className="text-destructive flex items-center gap-1">
              <ShieldAlert size={10} /> Sabotasje!
            </span>
          )}
          {!entry.available && (
            <span className="text-destructive">stum</span>
          )}
        </div>
      </div>
    </li>
  );
}

function ContactRow({ entry }: { entry: DoorOrLockEntry }) {
  const open = entry.contactOpen === true;
  const unknown = entry.contactOpen == null;
  const Icon = unknown ? DoorClosed : open ? DoorOpen : DoorClosed;
  const tone = unknown
    ? "text-muted-foreground"
    : open
      ? "text-amber-300"
      : "text-emerald-400";
  const status = unknown
    ? "Vakten ser ikke"
    : open
      ? entry.kind === "window"
        ? "Vinduet står oppe"
        : "Porten står åpen"
      : entry.kind === "window"
        ? "Vinduet er lukket"
        : "Døren er stengt";
  return (
    <li className="rounded-md border border-border bg-background/40 p-3 flex items-start gap-3">
      <Icon size={18} className={tone} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground font-semibold truncate">
            {entry.name}
          </span>
          <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            {entry.zoneName}
          </span>
          <span className="text-[10px] text-muted-foreground" title={brandHouse(entry.brand)}>
            {brandSigil(entry.brand)}
          </span>
        </div>
        <div className={`text-[11px] tracking-[0.15em] uppercase mt-0.5 ${tone}`}>
          « {status} »
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
          <span>↻ {ago(entry.lastUpdated)}</span>
          {typeof entry.battery === "number" && (
            <span
              className={
                entry.battery < 20 ? "text-destructive" : "text-muted-foreground"
              }
            >
              🔋 {Math.round(entry.battery)}%
            </span>
          )}
          {entry.tamper && (
            <span className="text-destructive flex items-center gap-1">
              <ShieldAlert size={10} /> Sabotasje!
            </span>
          )}
          {!entry.available && (
            <span className="text-destructive">stum</span>
          )}
        </div>
      </div>
    </li>
  );
}

function MotionRow({ entry }: { entry: DoorOrLockEntry }) {
  const active = entry.motion === true;
  return (
    <li className="rounded-md border border-border bg-background/40 p-3 flex items-start gap-3">
      <Activity
        size={18}
        className={active ? "text-amber-300" : "text-muted-foreground"}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground font-semibold truncate">
            {entry.name}
          </span>
          <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            {entry.zoneName}
          </span>
          <span className="text-[10px] text-muted-foreground" title={brandHouse(entry.brand)}>
            {brandSigil(entry.brand)}
          </span>
        </div>
        <div
          className={`text-[11px] tracking-[0.15em] uppercase mt-0.5 ${
            active ? "text-amber-300" : "text-muted-foreground"
          }`}
        >
          {active ? "« Bevegelse i sikte »" : "« Stille i salen »"}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Sist rørelse: {ago(entry.lastUpdated)}
          {typeof entry.battery === "number" && (
            <span
              className={
                entry.battery < 20
                  ? "text-destructive ml-3"
                  : "text-muted-foreground ml-3"
              }
            >
              🔋 {Math.round(entry.battery)}%
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function Section({
  title,
  count,
  badge,
  badgeTone,
  children,
}: {
  title: string;
  count: number;
  badge?: string;
  badgeTone?: "ok" | "warn" | "muted";
  children: React.ReactNode;
}) {
  const tone =
    badgeTone === "warn"
      ? "text-destructive border-destructive/40"
      : badgeTone === "ok"
        ? "text-emerald-400 border-emerald-400/40"
        : "text-muted-foreground border-border";
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] tracking-[0.3em] uppercase text-primary">
          {title}{" "}
          <span className="text-muted-foreground/70">({count})</span>
        </h3>
        {badge && (
          <span
            className={`text-[9px] tracking-[0.25em] uppercase px-2 py-0.5 rounded border ${tone}`}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SealedCollapsible({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-left hover:bg-emerald-400/10 transition-colors">
        <span className="text-[10px] tracking-[0.25em] uppercase text-emerald-400/90 italic">
          « {label} » <span className="text-muted-foreground/70 not-italic">({count})</span>
        </span>
        {open ? (
          <Minus size={14} className="text-emerald-400/80 shrink-0" />
        ) : (
          <Plus size={14} className="text-emerald-400/80 shrink-0" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="space-y-2 mt-2">{children}</ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// =====================================================
// Alarm-panel (Verisure "Hjem alarm" via Homey)
// =====================================================

function alarmStateLabel(state: HomeAlarmState | null): string {
  if (state === "armed") return "Vakthold satt — alarmen ruver";
  if (state === "partially_armed") return "Halvt vakthold — natt-modus";
  if (state === "disarmed") return "Vakten hviler — alarmen er av";
  return "Ukjent — vakten svarer ikke";
}

function alarmStateShort(state: HomeAlarmState | null): string {
  if (state === "armed") return "PÅ";
  if (state === "partially_armed") return "DELVIS";
  if (state === "disarmed") return "AV";
  return "?";
}

function HomeAlarmPanel() {
  const fetchAlarm = useServerFn(getHomeAlarmStatus);
  const setAlarm = useServerFn(setHomeAlarmState);
  const [alarm, setAlarmStateLocal] = useState<
    | { status: "loading" }
    | { status: "ok"; data: Extract<HomeAlarmStatusResult, { ok: true }> }
    | { status: "error"; message: string; needsConnect?: boolean }
  >({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<Who>("Alle");
  const [log, setLog] = useState<AlarmLogRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inFlight = useRef(false);

  // Hent lagret "hvem" på klienten
  useEffect(() => {
    setWho(getStoredWho());
  }, []);

  const loadLog = useCallback(async () => {
    const { data } = await supabase
      .from("home_alarm_log")
      .select("id,state,who,changed_at")
      .order("changed_at", { ascending: false })
      .limit(20);
    if (data) setLog(data as AlarmLogRow[]);
  }, []);

  const loadStatus = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetchAlarm();
      if (res.ok) {
        setAlarmStateLocal({ status: "ok", data: res });
      } else {
        setAlarmStateLocal((prev) =>
          prev.status === "ok"
            ? prev
            : { status: "error", message: res.error ?? "Ukjent feil", needsConnect: res.needsConnect },
        );
      }
    } catch (e: any) {
      setAlarmStateLocal((prev) =>
        prev.status === "ok" ? prev : { status: "error", message: e?.message ?? "Ukjent feil" },
      );
    } finally {
      inFlight.current = false;
    }
  }, [fetchAlarm]);

  useEffect(() => {
    loadStatus();
    loadLog();
    const id = window.setInterval(loadStatus, ALARM_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadStatus, loadLog]);

  const handleSet = async (next: HomeAlarmState) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await setAlarm({ data: { state: next, who } });
      if (res.ok) {
        // Logg lokalt i Supabase (server-funksjonen bekrefter Homey-bytte)
        await supabase.from("home_alarm_log").insert({
          state: res.state,
          who: res.who,
          source: "borgen-app",
        });
        await loadLog();
        await loadStatus();
      } else {
        setAlarmStateLocal({ status: "error", message: res.error });
      }
    } catch (e: any) {
      setAlarmStateLocal({ status: "error", message: e?.message ?? "Ukjent feil" });
    } finally {
      setBusy(false);
    }
  };

  if (alarm.status === "loading") {
    return (
      <div className="rounded-md border border-border bg-background/40 p-3">
        <div className="text-[10px] tracking-[0.3em] uppercase text-primary mb-1">
          ⚔ Vakttårnet
        </div>
        <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground italic">
          Lytter etter alarmens hjerteslag…
        </div>
      </div>
    );
  }

  if (alarm.status === "error") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <div className="text-[10px] tracking-[0.3em] uppercase text-destructive mb-1">
          ⚔ Vakttårnet
        </div>
        <div className="text-[11px] text-destructive italic">{alarm.message}</div>
      </div>
    );
  }

  const { state, deviceName, zoneName, lastUpdated, available } = alarm.data;
  const isArmed = state === "armed" || state === "partially_armed";
  const lastFromLog = log[0];
  const lastByLine =
    lastFromLog
      ? `Sist endret av ${lastFromLog.who} — ${ago(lastFromLog.changed_at)}`
      : lastUpdated
        ? `Sist endret ${ago(lastUpdated)}`
        : null;

  const cardTone = isArmed
    ? "border-emerald-400/40 bg-emerald-400/10"
    : state === "disarmed"
      ? "border-amber-400/40 bg-amber-400/10"
      : "border-border bg-background/40";
  const labelTone = isArmed
    ? "text-emerald-400"
    : state === "disarmed"
      ? "text-amber-300"
      : "text-muted-foreground";
  const Icon = isArmed ? ShieldCheck : state === "disarmed" ? ShieldOff : ShieldAlert;

  return (
    <div className={`rounded-md border p-3 ${cardTone}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] tracking-[0.3em] uppercase text-primary">
          ⚔ Vakttårnet — {deviceName}
        </div>
        <span
          className={`text-[9px] tracking-[0.25em] uppercase px-2 py-0.5 rounded border ${
            isArmed
              ? "text-emerald-400 border-emerald-400/40"
              : state === "disarmed"
                ? "text-amber-300 border-amber-400/40"
                : "text-muted-foreground border-border"
          }`}
        >
          {alarmStateShort(state)}
        </span>
      </div>

      <div className="flex items-start gap-3">
        <Icon size={28} className={labelTone} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold italic ${labelTone}`}>
            « {alarmStateLabel(state)} »
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
            <span>{zoneName}</span>
            {!available && <span className="text-destructive">stum</span>}
            {lastByLine && <span>↻ {lastByLine}</span>}
          </div>
        </div>
      </div>

      {/* Toggle-knapper */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || state === "armed"}
          onClick={() => handleSet("armed")}
          className={`rounded-md border px-3 py-2 text-[10px] tracking-[0.25em] uppercase transition-colors ${
            state === "armed"
              ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-300 cursor-default"
              : "border-emerald-400/30 bg-emerald-400/5 text-emerald-300 hover:bg-emerald-400/15"
          } ${busy ? "opacity-50" : ""} flex items-center justify-center gap-2`}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
          Skru på
        </button>
        <button
          type="button"
          disabled={busy || state === "disarmed"}
          onClick={() => handleSet("disarmed")}
          className={`rounded-md border px-3 py-2 text-[10px] tracking-[0.25em] uppercase transition-colors ${
            state === "disarmed"
              ? "border-amber-400/40 bg-amber-400/20 text-amber-200 cursor-default"
              : "border-amber-400/30 bg-amber-400/5 text-amber-200 hover:bg-amber-400/15"
          } ${busy ? "opacity-50" : ""} flex items-center justify-center gap-2`}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
          Skru av
        </button>
      </div>

      {/* Hvem-velger */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">
          Vakt:
        </span>
        <select
          value={who}
          onChange={(e) => {
            const next = e.target.value as Who;
            setWho(next);
            setStoredWho(next);
          }}
          className="text-[10px] tracking-[0.2em] uppercase bg-background border border-border rounded px-2 py-1 text-foreground"
        >
          {WHO_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <span className="text-[9px] text-muted-foreground/70 italic">
          (huskes på denne enheten)
        </span>
      </div>

      {/* Logg */}
      {log.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mt-3">
          <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-left hover:bg-background/60 transition-colors">
            <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground italic">
              « Krøniken om vakten » <span className="text-muted-foreground/70 not-italic">({log.length})</span>
            </span>
            {historyOpen ? <Minus size={14} /> : <Plus size={14} />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="space-y-1 mt-2">
              {log.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground border-b border-border/40 pb-1"
                >
                  <span className="flex items-center gap-2">
                    {row.state === "armed" ? (
                      <ShieldCheck size={11} className="text-emerald-400" />
                    ) : row.state === "partially_armed" ? (
                      <ShieldAlert size={11} className="text-amber-300" />
                    ) : (
                      <ShieldOff size={11} className="text-amber-300" />
                    )}
                    <span className="text-foreground/90">{row.who}</span>
                    <span className="text-muted-foreground/80">
                      → {row.state === "armed" ? "PÅ" : row.state === "disarmed" ? "AV" : "DELVIS"}
                    </span>
                  </span>
                  <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground/70">
                    {ago(row.changed_at)}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function DoorsLocksPanel() {
  const fetchData = useServerFn(getDoorsLocksSnapshot);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ok"; data: Extract<DoorsLocksResult, { ok: true }> }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetchData();
        if (!alive) return;
        if (res.ok) {
          setState({ status: "ok", data: res });
        } else {
          setState((prev) =>
            prev.status === "ok"
              ? prev
              : { status: "error", message: res.error ?? "Ukjent feil" },
          );
        }
      } catch (e: any) {
        if (!alive) return;
        setState((prev) =>
          prev.status === "ok"
            ? prev
            : { status: "error", message: e?.message ?? "Ukjent feil" },
        );
      } finally {
        inFlight.current = false;
      }
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [fetchData]);

  if (state.status === "loading") {
    return (
      <div className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground italic">
        Vakten teller portene…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="text-[11px] text-destructive italic">{state.message}</div>
    );
  }

  const { locks, doors, windows, motions } = state.data;

  const openDoors = doors.filter((d) => d.contactOpen === true);
  const openWindows = windows.filter((d) => d.contactOpen === true);
  const unlocked = locks.filter((d) => d.locked === false);
  const lowBatteries = [...locks, ...doors, ...windows, ...motions].filter(
    (d) => typeof d.battery === "number" && d.battery < 20,
  );

  const totalKnown =
    locks.length + doors.length + windows.length + motions.length;
  if (totalKnown === 0) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        Ingen Yale Doorman eller Verisure-enheter funnet i Homey.
      </div>
    );
  }

  const allSecure = openDoors.length === 0 && openWindows.length === 0 && unlocked.length === 0;

  return (
    <div className="space-y-5">
      {/* Sammendrag */}
      <div
        className={`rounded-md border p-3 ${
          allSecure
            ? "border-emerald-400/30 bg-emerald-400/5"
            : "border-amber-400/30 bg-amber-400/5"
        }`}
      >
        <div
          className={`text-[11px] tracking-[0.2em] uppercase italic ${
            allSecure ? "text-emerald-400" : "text-amber-300"
          }`}
        >
          {allSecure
            ? "« Borgen er forseglet — vakten kan hvile »"
            : "« Vakten ser åpne porter — meld fra til maesteren »"}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <span>{locks.length} låser</span>
          <span>{doors.length} dører</span>
          <span>{windows.length} vinduer</span>
          <span>{motions.length} bevegelses-ravner</span>
          {lowBatteries.length > 0 && (
            <span className="text-destructive flex items-center gap-1">
              <BatteryLow size={11} /> {lowBatteries.length} svake batterier
            </span>
          )}
        </div>
      </div>

      {/* Låser */}
      {locks.length > 0 && (() => {
        const sealed = locks.filter((l) => l.locked === true);
        const rest = locks.filter((l) => l.locked !== true);
        return (
          <Section
            title="Husets låser"
            count={locks.length}
            badge={
              unlocked.length === 0
                ? "Alle forseglet"
                : `${unlocked.length} åpne`
            }
            badgeTone={unlocked.length === 0 ? "ok" : "warn"}
          >
            {rest.length > 0 && (
              <ul className="space-y-2">
                {rest.map((l) => (
                  <LockRow key={l.id} entry={l} />
                ))}
              </ul>
            )}
            <SealedCollapsible label="Forseglede låser" count={sealed.length}>
              {sealed.map((l) => (
                <LockRow key={l.id} entry={l} />
              ))}
            </SealedCollapsible>
          </Section>
        );
      })()}

      {/* Dører */}
      {doors.length > 0 && (() => {
        const sealed = doors.filter((d) => d.contactOpen === false);
        const rest = doors.filter((d) => d.contactOpen !== false);
        return (
          <Section
            title="Borgens porter"
            count={doors.length}
            badge={
              openDoors.length === 0
                ? "Alle stengt"
                : `${openDoors.length} åpne`
            }
            badgeTone={openDoors.length === 0 ? "ok" : "warn"}
          >
            {rest.length > 0 && (
              <ul className="space-y-2">
                {rest.map((d) => (
                  <ContactRow key={d.id} entry={d} />
                ))}
              </ul>
            )}
            <SealedCollapsible label="Stengte porter" count={sealed.length}>
              {sealed.map((d) => (
                <ContactRow key={d.id} entry={d} />
              ))}
            </SealedCollapsible>
          </Section>
        );
      })()}

      {/* Vinduer */}
      {windows.length > 0 && (() => {
        const sealed = windows.filter((w) => w.contactOpen === false);
        const rest = windows.filter((w) => w.contactOpen !== false);
        return (
          <Section
            title="Borgens vinduer"
            count={windows.length}
            badge={
              openWindows.length === 0
                ? "Alle lukket"
                : `${openWindows.length} oppe`
            }
            badgeTone={openWindows.length === 0 ? "ok" : "warn"}
          >
            {rest.length > 0 && (
              <ul className="space-y-2">
                {rest.map((w) => (
                  <ContactRow key={w.id} entry={w} />
                ))}
              </ul>
            )}
            <SealedCollapsible label="Lukkede vinduer" count={sealed.length}>
              {sealed.map((w) => (
                <ContactRow key={w.id} entry={w} />
              ))}
            </SealedCollapsible>
          </Section>
        );
      })()}
      {motions.length > 0 && (
        <Section title="Siste bevegelser" count={motions.length}>
          <ul className="space-y-2">
            {motions.slice(0, 8).map((m) => (
              <MotionRow key={m.id} entry={m} />
            ))}
          </ul>
        </Section>
      )}

      <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/60 text-right">
        ↻ Sist meldt {ago(state.data.fetchedAt)}
      </div>
    </div>
  );
}

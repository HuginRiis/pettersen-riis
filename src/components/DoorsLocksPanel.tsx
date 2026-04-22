import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getDoorsLocksSnapshot,
  type DoorOrLockEntry,
  type DoorsLocksResult,
} from "@/server/homey";
import { DoorClosed, DoorOpen, Lock, Unlock, Activity, ShieldAlert, BatteryLow, Plus, Minus } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const REFRESH_MS = 30_000;

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
      {locks.length > 0 && (
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
          <ul className="space-y-2">
            {locks.map((l) => (
              <LockRow key={l.id} entry={l} />
            ))}
          </ul>
        </Section>
      )}

      {/* Dører */}
      {doors.length > 0 && (
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
          <ul className="space-y-2">
            {doors.map((d) => (
              <ContactRow key={d.id} entry={d} />
            ))}
          </ul>
        </Section>
      )}

      {/* Vinduer */}
      {windows.length > 0 && (
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
          <ul className="space-y-2">
            {windows.map((w) => (
              <ContactRow key={w.id} entry={w} />
            ))}
          </ul>
        </Section>
      )}

      {/* Bevegelser */}
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

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Unlock, ShieldCheck, ShieldOff, ShieldAlert, DoorClosed, DoorOpen } from "lucide-react";
import { getDoorsLocksSnapshot, type DoorOrLockEntry } from "@/lib/homey.functions";
import { getVakttarnetHeroStatus, type VakttarnetHeroStatus } from "@/lib/homey.functions-sensor-dashboard.functions";

function minsAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(diff / 60_000));
  if (m < 1) return "nå";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t`;
  return `${Math.floor(h / 24)} d`;
}

export function DoorAlarmTile() {
  const fetchLocks = useServerFn(getDoorsLocksSnapshot);
  const fetchHero = useServerFn(getVakttarnetHeroStatus);
  const [lock, setLock] = useState<DoorOrLockEntry | null>(null);
  const [hero, setHero] = useState<VakttarnetHeroStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [r, h] = await Promise.all([fetchLocks(), fetchHero()]);
        if (!alive) return;
        if (r.ok) {
          const found =
            r.locks.find((l) => l.brand === "verisure") ??
            r.locks.find((l) => l.name.toLowerCase().includes("utgang")) ??
            r.locks[0] ?? null;
          setLock(found);
        }
        setHero(h);
      } catch {}
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [fetchLocks, fetchHero]);

  const locked = lock?.locked === true;
  const unknownLock = lock?.locked == null;
  const LockIcon = locked || unknownLock ? Lock : Unlock;
  const DoorIcon = locked || unknownLock ? DoorClosed : DoorOpen;
  const lockColor = unknownLock
    ? "var(--muted-foreground)"
    : locked
      ? "oklch(0.75 0.16 150)"
      : "oklch(0.65 0.22 25)";

  const alarmState = hero?.lastAlarmChange?.state ?? null;
  const alarmOn = alarmState && alarmState !== "disarmed";
  const AlarmIcon = alarmState === "disarmed"
    ? ShieldOff
    : alarmState === "partially_armed"
      ? ShieldAlert
      : ShieldCheck;
  const alarmColor = !alarmState
    ? "var(--muted-foreground)"
    : alarmState === "disarmed"
      ? "oklch(0.78 0.16 60)"
      : "oklch(0.75 0.16 150)";

  const glowActive = (locked || alarmOn);

  return (
    <article
      className="panel rounded-lg overflow-hidden flex flex-col"
      style={
        glowActive
          ? {
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${alarmOn ? alarmColor : lockColor} 22%, transparent), 0 0 18px color-mix(in oklab, ${alarmOn ? alarmColor : lockColor} 14%, transparent)`,
            }
          : undefined
      }
    >
      <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
        <span className="text-display tracking-[0.3em] text-primary text-[10px] sm:text-xs uppercase">
          Port &amp; Vakt
        </span>
        <span className="text-[9px] tracking-[0.25em] text-muted-foreground/70 uppercase tabular-nums">
          {hero?.lastDoorClose ? `↻ ${minsAgo(hero.lastDoorClose.ts)}` : ""}
        </span>
      </div>

      <div className="flex-1 p-2 grid grid-cols-2 gap-2">
        {/* Dør */}
        <div className="flex flex-col items-center justify-center gap-1 rounded-md bg-background/30 py-2">
          <div className="relative flex items-center justify-center">
            <DoorIcon size={32} style={{ color: lockColor, opacity: 0.35 }} strokeWidth={1.25} />
            <LockIcon
              size={16}
              style={{ color: lockColor, position: "absolute", filter: `drop-shadow(0 0 6px ${lockColor})` }}
              strokeWidth={2}
            />
          </div>
          <div
            className="text-display leading-none tabular-nums"
            style={{ color: lockColor, fontSize: "clamp(0.7rem, 2.4vw, 0.95rem)" }}
          >
            {unknownLock ? "—" : locked ? "LÅST" : "ÅPEN"}
          </div>
          <div className="text-[9px] tracking-[0.2em] text-muted-foreground/70 uppercase">
            Utgangsdør
          </div>
        </div>

        {/* Alarm */}
        <div className="flex flex-col items-center justify-center gap-1 rounded-md bg-background/30 py-2">
          <div className="relative flex items-center justify-center">
            <AlarmIcon
              size={32}
              style={{ color: alarmColor, filter: alarmOn ? `drop-shadow(0 0 8px ${alarmColor})` : undefined }}
              strokeWidth={1.5}
            />
            {alarmOn && (
              <span
                className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: alarmColor, boxShadow: `0 0 6px ${alarmColor}` }}
              />
            )}
          </div>
          <div
            className="text-display leading-none tabular-nums"
            style={{ color: alarmColor, fontSize: "clamp(0.7rem, 2.4vw, 0.95rem)" }}
          >
            {!alarmState
              ? "—"
              : alarmState === "disarmed"
                ? "AV"
                : alarmState === "partially_armed"
                  ? "DELVIS"
                  : "PÅ"}
          </div>
          <div className="text-[9px] tracking-[0.2em] text-muted-foreground/70 uppercase">
            {hero?.lastAlarmChange ? minsAgo(hero.lastAlarmChange.ts) : "Alarm"}
          </div>
        </div>
      </div>
    </article>
  );
}

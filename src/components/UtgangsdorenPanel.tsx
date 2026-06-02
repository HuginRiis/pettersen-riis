import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDoorsLocksSnapshot, setLockState, type DoorOrLockEntry } from "@/lib/homey.functions";
import { Lock, Unlock, Loader2, Flame, DoorClosed } from "lucide-react";

const REFRESH_MS = 20_000;
const MATCH = "utgangsdør"; // matcher "Utgangsdøren"

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

function BatteryFlame({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const tone = v < 20 ? "text-destructive" : v < 40 ? "text-amber-400" : "text-emerald-400";
  return (
    <span className="inline-flex items-center gap-1 tabular-nums text-[11px]">
      <Flame size={12} className={`${tone} shrink-0`} strokeWidth={1.75} fill="currentColor" fillOpacity={0.25} />
      {Math.round(v)}%
    </span>
  );
}

export function UtgangsdorenPanel() {
  const fetchSnap = useServerFn(getDoorsLocksSnapshot);
  const setLock = useServerFn(setLockState);
  const [entry, setEntry] = useState<DoorOrLockEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (force = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetchSnap(force ? { data: { force: true } } : undefined);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const found =
        res.locks.find((l) => l.brand === "verisure") ??
        res.locks.find((l) => l.name.toLowerCase().includes(MATCH)) ??
        res.locks.find((l) => l.name.toLowerCase().includes("utgang")) ??
        null;
      setEntry(found);
      setError(found ? null : "Fant ingen Verisure-lås");
    } catch (e: any) {
      setError(e?.message ?? "Ukjent feil");
    } finally {
      inFlight.current = false;
    }
  }, [fetchSnap]);

  useEffect(() => {
    // Force fresh data on mount / page refresh — bypass server-side 3 min cache
    load(true);
    const id = window.setInterval(() => load(false), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const toggle = async () => {
    if (!entry || busy) return;
    setBusy(true);
    try {
      const next = !(entry.locked === true);
      const res = await setLock({ data: { deviceId: entry.id, locked: next } });
      if (!res.ok) {
        setError(res.error ?? "Kommando feilet");
      } else {
        setEntry({ ...entry, locked: next, lastUpdated: new Date().toISOString() });
        setTimeout(() => load(true), 1500);
      }
    } finally {
      setBusy(false);
    }
  };

  if (error && !entry) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive italic">
        {error}
      </div>
    );
  }
  if (!entry) {
    return (
      <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-3 text-[11px] text-muted-foreground italic">
        Lytter etter Utgangsdøren…
      </div>
    );
  }

  const locked = entry.locked === true;
  const unknown = entry.locked == null;
  const tone = unknown ? "text-muted-foreground" : locked ? "text-emerald-400" : "text-destructive";
  const cardTone = unknown
    ? "border-border bg-card/60"
    : locked
      ? "border-emerald-400/40 bg-emerald-400/10"
      : "border-destructive/40 bg-destructive/10";
  const Icon = locked || unknown ? Lock : Unlock;

  return (
    <div className={`rounded-lg border ${cardTone} backdrop-blur p-3 sm:p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <DoorClosed size={14} className="text-primary" />
        <h2 className="text-display tracking-[0.25em] text-primary uppercase text-xs flex-1">
          Utgangsdøren
        </h2>
        <span className={`text-[9px] tracking-[0.25em] uppercase px-2 py-0.5 rounded border ${tone} border-current/40`}>
          {unknown ? "?" : locked ? "LÅST" : "ÅPEN"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Icon size={32} className={tone} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold italic ${tone}`}>
            « {unknown ? "Vakten svarer ikke" : locked ? "Lukket og forseglet" : "Porten står åpen"} »
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 items-center">
            <span>↻ {ago(entry.lastUpdated)}</span>
            {typeof entry.battery === "number" && <BatteryFlame value={entry.battery} />}
            {!entry.available && <span className="text-destructive">stum</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || unknown || !entry.available}
          className={`shrink-0 rounded-md border px-3 py-2 text-[10px] tracking-[0.25em] uppercase transition-colors flex items-center gap-2 ${
            locked
              ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
              : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
          } ${busy || unknown || !entry.available ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : locked ? (
            <Unlock size={12} />
          ) : (
            <Lock size={12} />
          )}
          {locked ? "Lås opp" : "Lås"}
        </button>
      </div>
      {error && <div className="text-[10px] text-destructive italic mt-2">{error}</div>}
    </div>
  );
}

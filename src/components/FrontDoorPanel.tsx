import { useEffect, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getFrontDoorStatus, setFrontDoorLock, type FrontDoorStatus } from "@/server/homey";
import { Lock, Unlock, DoorOpen, DoorClosed, Loader2, Flame, ShieldAlert } from "lucide-react";

function ago(iso: string | null | undefined): string {
  if (!iso) return "ukjent";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "nå";
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} t siden`;
  return `${Math.round(hrs / 24)} d siden`;
}

export function FrontDoorPanel() {
  const fetchStatus = useServerFn(getFrontDoorStatus);
  const setLock = useServerFn(setFrontDoorLock);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ok"; data: Extract<FrontDoorStatus, { ok: true }> }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetchStatus();
      if (res.ok) setState({ status: "ok", data: res });
      else setState((p) => (p.status === "ok" ? p : { status: "error", message: res.error }));
    } catch (e: any) {
      setState((p) => (p.status === "ok" ? p : { status: "error", message: e?.message ?? "Feil" }));
    } finally {
      inFlight.current = false;
    }
  }, [fetchStatus]);

  useEffect(() => {
    load();
    const i = window.setInterval(load, 30_000);
    return () => window.clearInterval(i);
  }, [load]);

  const handleSet = async (locked: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await setLock({ data: { locked } });
      if (!res.ok) {
        setState({ status: "error", message: res.error ?? "Feil" });
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  if (state.status === "loading") {
    return (
      <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground italic">
        Lytter etter utgangsdøren…
      </div>
    );
  }
  if (state.status === "error") {
    return <div className="text-[11px] text-destructive italic">{state.message}</div>;
  }

  const { lock, door } = state.data;
  if (!lock && !door) {
    return <div className="text-[11px] text-muted-foreground italic">Fant ingen utgangsdør i Homey.</div>;
  }

  const locked = lock?.locked === true;
  const open = door?.contactOpen === true || lock?.contactOpen === true;
  const battery = lock?.battery ?? door?.battery ?? null;
  const tamper = lock?.tamper === true || door?.tamper === true;
  const lastUpdated = lock?.lastUpdated ?? door?.lastUpdated ?? null;
  const name = lock?.name ?? door?.name ?? "Utgangsdør";

  const tone = open
    ? "border-amber-400/40 bg-amber-400/10"
    : locked
      ? "border-emerald-400/40 bg-emerald-400/10"
      : "border-rose-400/40 bg-rose-400/10";

  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <div className="flex items-start gap-3">
        {open ? (
          <DoorOpen size={28} className="text-amber-300" />
        ) : locked ? (
          <Lock size={28} className="text-emerald-400" />
        ) : (
          <Unlock size={28} className="text-rose-400" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.3em] uppercase text-primary">
            ⚔ Utgangsdøren — {name}
          </div>
          <div
            className={`text-sm font-semibold italic ${
              open ? "text-amber-300" : locked ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            «{" "}
            {open
              ? "Døren står åpen"
              : locked
                ? "Forseglet og trygg"
                : "Ulåst — porten kan åpnes"}
            {" »"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>↻ {ago(lastUpdated)}</span>
            {typeof battery === "number" && (
              <span className="inline-flex items-center gap-1">
                <Flame
                  size={11}
                  strokeWidth={1.75}
                  fill="currentColor"
                  fillOpacity={battery < 20 ? 0.35 : battery < 40 ? 0.25 : 0.2}
                  className={
                    battery < 20
                      ? "text-destructive"
                      : battery < 40
                        ? "text-amber-400"
                        : "text-emerald-400"
                  }
                />
                {Math.round(battery)}%
              </span>
            )}
            {tamper && (
              <span className="text-destructive flex items-center gap-1">
                <ShieldAlert size={10} /> Sabotasje
              </span>
            )}
          </div>
        </div>
      </div>

      {lock && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || locked}
            onClick={() => handleSet(true)}
            className={`rounded-md border px-3 py-2 text-[10px] tracking-[0.25em] uppercase transition-colors flex items-center justify-center gap-2 ${
              locked
                ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-300 cursor-default"
                : "border-emerald-400/30 bg-emerald-400/5 text-emerald-300 hover:bg-emerald-400/15"
            } ${busy ? "opacity-50" : ""}`}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
            Lås
          </button>
          <button
            type="button"
            disabled={busy || (lock.locked === false)}
            onClick={() => handleSet(false)}
            className={`rounded-md border px-3 py-2 text-[10px] tracking-[0.25em] uppercase transition-colors flex items-center justify-center gap-2 ${
              lock.locked === false
                ? "border-rose-400/40 bg-rose-400/20 text-rose-300 cursor-default"
                : "border-rose-400/30 bg-rose-400/5 text-rose-300 hover:bg-rose-400/15"
            } ${busy ? "opacity-50" : ""}`}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
            Lås opp
          </button>
        </div>
      )}

      {!lock && (
        <div className="mt-2 text-[10px] text-muted-foreground italic">
          Ingen smartlås knyttet til utgangsdøren — kun kontaktsensor vises.
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getReclaimProgress } from "@/lib/db-cleanup.functions";
import { CheckCircle2, Loader2 } from "lucide-react";

export type ProgressState = {
  /** Synlig eller ikke */
  visible: boolean;
  /** 0–100 */
  percent: number;
  label: string;
  detail?: string;
  done: boolean;
};

const IDLE: ProgressState = { visible: false, percent: 0, label: "", done: false };

/**
 * Fremdrift for sletting + komprimering.
 * Sletting vises som faser (ubestemt), komprimering leser faktisk
 * VACUUM-fremdrift fra databasen hvert 3. sekund.
 */
export function useDbProgress() {
  const progressFn = useServerFn(getReclaimProgress);
  const [state, setState] = useState<ProgressState>(IDLE);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  /** Enkel fase-indikator (f.eks. under sletting). */
  const setPhase = useCallback((label: string, percent: number, detail?: string) => {
    setState({ visible: true, percent, label, detail, done: false });
  }, []);

  const finish = useCallback((label: string, detail?: string) => {
    stop();
    setState({ visible: true, percent: 100, label, detail, done: true });
    setTimeout(() => setState(IDLE), 6000);
  }, []);

  const hide = useCallback(() => {
    stop();
    setState(IDLE);
  }, []);

  /** Start polling av VACUUM-fremdrift. */
  const trackReclaim = useCallback(() => {
    stop();
    setState({
      visible: true,
      percent: 3,
      label: "Komprimerer database…",
      detail: "Planlegger VACUUM FULL",
      done: false,
    });
    let sawActive = false;
    const tick = async () => {
      try {
        const p = await progressFn({});
        if (p.active) {
          sawActive = true;
          const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 5;
          setState({
            visible: true,
            percent: Math.min(97, Math.max(3, pct)),
            label: "Komprimerer database…",
            detail:
              `${p.done} av ${p.total} tabeller ferdig` +
              (p.currentTable ? ` · jobber med ${p.currentTable}` : ""),
            done: false,
          });
        } else if (sawActive) {
          finish("Komprimering ferdig", "All ledig plass er frigjort.");
        }
      } catch (e) {
        console.warn("[db-progress]", e);
      }
    };
    void tick();
    timer.current = setInterval(tick, 3000);
    // Sikkerhetsstopp etter 10 minutter
    setTimeout(() => {
      if (timer.current) finish("Komprimering fullført", undefined);
    }, 600_000);
  }, [progressFn, finish]);

  return { state, setPhase, finish, hide, trackReclaim };
}

export function DbProgressBar({ state }: { state: ProgressState }) {
  if (!state.visible) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-2 text-foreground/90">
          {state.done ? (
            <CheckCircle2 size={14} className="text-emerald-400" />
          ) : (
            <Loader2 size={14} className="animate-spin text-cyan-300" />
          )}
          {state.label}
        </span>
        <span className="tabular-nums text-muted-foreground">{state.percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-border/40 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            state.done ? "bg-emerald-400" : "bg-cyan-400"
          }`}
          style={{ width: `${Math.max(2, state.percent)}%` }}
        />
      </div>
      {state.detail && (
        <div className="text-[10px] text-muted-foreground">{state.detail}</div>
      )}
    </div>
  );
}

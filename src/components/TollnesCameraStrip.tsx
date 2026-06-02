import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getNetatmoCameraSnapshot } from "@/lib/netatmo";

type Props = {
  /** Refresh interval in ms. Default 5000. */
  intervalMs?: number;
  /** Hide the meta footer (compact mode). */
  compact?: boolean;
  /** Aspect ratio class. Default aspect-video. */
  aspectClass?: string;
  /** Substring-match på Netatmo-kameranavn. Default "tollnes". */
  cameraMatch?: string;
  /** Visningsetikett i footer/fallback. */
  label?: string;
};

export function TollnesCameraStrip({
  intervalMs = 5000,
  compact = false,
  aspectClass = "aspect-video",
  cameraMatch = "tollnes",
  label,
}: Props) {
  const fetchSnap = useServerFn(getNetatmoCameraSnapshot);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ok"; dataUrl: string; name: string; at: string }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [tick, setTick] = useState(0);
  const inFlight = useRef(false);

  const load = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetchSnap({ data: { match: cameraMatch } });
      if (res.ok) {
        setState({
          status: "ok",
          dataUrl: res.dataUrl,
          name: res.deviceName,
          at: res.capturedAt,
        });
      } else {
        setState((prev) =>
          prev.status === "ok" ? prev : { status: "error", message: res.error },
        );
      }
    } catch (e: any) {
      setState((prev) =>
        prev.status === "ok"
          ? prev
          : { status: "error", message: e?.message ?? "Ukjent feil" },
      );
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  useEffect(() => {
    if (tick > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <article className="panel rounded-lg overflow-hidden">
      <div className={`${aspectClass} bg-muted flex items-center justify-center relative`}>
        {state.status === "loading" && (
          <span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
            Sender ravn til kameraet…
          </span>
        )}
        {state.status === "ok" && (
          <>
            <img
              src={state.dataUrl}
              alt={`Live fra ${state.name}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-background/70 backdrop-blur-sm border border-destructive/40">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-[10px] tracking-[0.25em] uppercase text-destructive font-semibold">
                Live
              </span>
            </div>
          </>
        )}
        {state.status === "error" && (
          <div className="text-center px-6">
            <div className="text-xs tracking-[0.3em] text-destructive uppercase mb-2">
              Ravnen kom ikke fram
            </div>
            <p className="text-xs text-muted-foreground">{state.message}</p>
          </div>
        )}
      </div>
      {!compact && (
        <div className="p-3 flex items-center justify-between text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
          <span>{state.status === "ok" ? state.name : (label ?? "Netatmo")}</span>
          <span className="text-primary/70">↻ Oppdateres hvert {Math.round(intervalMs / 1000)}s</span>
        </div>
      )}
    </article>
  );
}

/** Wrapper that keeps the existing homepage section layout. */
export function TollnesCameraSection() {
  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Vakttårnet på Tollnes
        </span>
      </div>
      <div className="max-w-3xl mx-auto">
        <TollnesCameraStrip />
      </div>
    </section>
  );
}

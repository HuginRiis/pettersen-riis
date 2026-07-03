import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { getHomeyApiPaused, setHomeyApiPaused } from "@/lib/homey.functions";

/**
 * Liten admin-bryter for å pause/åpne Homey-API på serveren.
 * Bruker en runtime-flag — påvirker alle Homey-kall umiddelbart.
 */
export function HomeyApiPauseToggle() {
  const getPaused = useServerFn(getHomeyApiPaused);
  const setPaused = useServerFn(setHomeyApiPaused);
  const router = useRouter();

  const [paused, setPausedState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPaused()
      .then((res) => {
        if (!cancelled) setPausedState(res.paused);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Klarte ikke lese status");
      });
    return () => {
      cancelled = true;
    };
  }, [getPaused]);

  const toggle = async () => {
    if (paused === null) return;
    setBusy(true);
    setError(null);
    try {
      const next = !paused;
      const res = await setPaused({ data: { paused: next } });
      setPausedState(res.paused);
      // Hvis vi åpnet igjen — last loader på nytt slik at Smarthus prøver å hente data.
      if (!res.paused) await router.invalidate();
    } catch (e: any) {
      setError(e?.message ?? "Klarte ikke endre status");
    } finally {
      setBusy(false);
    }
  };

  const tone = paused
    ? "border-destructive/50 text-destructive"
    : "border-primary/50 text-primary";
  const dot = paused ? "bg-destructive" : "bg-primary";

  return (
    <section className="pt-4">
      <div className="panel rounded-lg p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${dot} ${paused ? "" : "animate-pulse"}`} />
          <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            Homey API
          </span>
          <span className={`text-xs tracking-[0.25em] uppercase ${paused ? "text-destructive" : "text-primary"}`}>
            {paused === null ? "…" : paused ? "Pauset" : "Åpen"}
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || paused === null}
          className={`ml-auto px-4 py-2 rounded border text-[11px] tracking-[0.3em] uppercase transition-colors disabled:opacity-50 ${tone} hover:bg-primary/10`}
        >
          {busy
            ? "Endrer…"
            : paused
              ? "✦ Slipp ravnene løs"
              : "○ Pause ravnene"}
        </button>
        {error && (
          <p className="basis-full text-[11px] text-destructive italic">{error}</p>
        )}
      </div>
    </section>
  );
}
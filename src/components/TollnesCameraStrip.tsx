import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getNetatmoTollnesSnapshot } from "@/server/netatmo";

export function TollnesCameraStrip() {
  const fetchSnap = useServerFn(getNetatmoTollnesSnapshot);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ok"; dataUrl: string; name: string; at: string }
    | { status: "error"; message: string }
  >({ status: "loading" });

  const load = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetchSnap();
      if (res.ok) {
        setState({
          status: "ok",
          dataUrl: res.dataUrl,
          name: res.deviceName,
          at: res.capturedAt,
        });
      } else {
        setState({ status: "error", message: res.error });
      }
    } catch (e: any) {
      setState({ status: "error", message: e?.message ?? "Ukjent feil" });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Vakttårnet på Tollnes
        </span>
      </div>

      <article className="panel rounded-lg overflow-hidden max-w-3xl mx-auto">
        <div className="aspect-video bg-muted flex items-center justify-center relative">
          {state.status === "loading" && (
            <span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
              Sender ravn til kameraet…
            </span>
          )}
          {state.status === "ok" && (
            <img
              src={state.dataUrl}
              alt={`Siste bilde fra ${state.name}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
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
        <div className="p-3 flex items-center justify-between text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
          <span>
            {state.status === "ok" ? state.name : "Netatmo · Tollnes"}
          </span>
          <button
            onClick={load}
            disabled={state.status === "loading"}
            className="hover:text-primary transition-colors disabled:opacity-50"
          >
            ↻ Oppfrisk
          </button>
        </div>
      </article>
    </section>
  );
}

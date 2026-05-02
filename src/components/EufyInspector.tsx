import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { inspectEufyCameras, type EufyCameraInfo } from "@/server/eufy-inspect.functions";
import { Search, Camera } from "lucide-react";

export function EufyInspector() {
  const fn = useServerFn(inspectEufyCameras);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<EufyCameraInfo[]>([]);
  const [candidates, setCandidates] = useState<EufyCameraInfo[]>([]);
  const [ran, setRan] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Ukjent feil");
      setCameras(r.cameras);
      setCandidates(r.candidates);
      setRan(true);
    } catch (e: any) {
      setError(e?.message ?? "Feil");
    } finally {
      setLoading(false);
    }
  };

  const list = cameras.length > 0 ? cameras : candidates;

  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Speidernes utstyr — Eufy-inspeksjon
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <Search size={12} />
          {loading ? "Speider…" : "Skann Homey"}
        </button>
      </div>

      {error && (
        <div className="text-xs text-destructive italic">⚠ {error}</div>
      )}

      {ran && list.length === 0 && !error && (
        <div className="text-xs text-muted-foreground italic">
          Fant ingen Eufy-merkede enheter eller kameraer i Homey.
        </div>
      )}

      {list.length > 0 && (
        <>
          {cameras.length === 0 && candidates.length > 0 && (
            <div className="text-[11px] text-muted-foreground italic">
              Ingen enhet med "eufy" i navnet — viser i stedet alt som ser ut som kamera.
            </div>
          )}
          <ul className="space-y-2">
            {list.map((c) => {
              const motionCaps = c.capabilities.filter((x) => x.startsWith("alarm_motion"));
              const hasSubtypes = motionCaps.some((x) => x.includes("."));
              return (
                <li
                  key={c.id}
                  className="rounded border border-border/40 bg-background/60 p-2 space-y-1"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Camera size={14} className="text-primary" />
                    <span className="font-serif text-foreground">{c.name}</span>
                    {c.zone && (
                      <span className="text-[10px] text-muted-foreground">@ {c.zone}</span>
                    )}
                    {hasSubtypes && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        Polling mulig ✓
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 font-mono break-all">
                    {c.driverUri || c.driverId || "(ukjent driver)"}
                  </div>
                  {motionCaps.length > 0 && (
                    <div className="text-[10px]">
                      <span className="text-muted-foreground">Motion-capabilities: </span>
                      <span className="font-mono text-amber-300">{motionCaps.join(", ")}</span>
                    </div>
                  )}
                  <details className="text-[10px]">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Alle {c.capabilities.length} capabilities
                    </summary>
                    <div className="mt-1 font-mono text-muted-foreground/90 break-all">
                      {c.capabilities.join(", ")}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

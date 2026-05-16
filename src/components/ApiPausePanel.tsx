import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getApiPauseFlags,
  setApiSourcePaused,
  type ApiPauseFlag,
} from "@/server/api-pause.functions";

const SOURCES: { id: string; label: string }[] = [
  { id: "homey", label: "Homey" },
  { id: "gardena", label: "Gardena (Husqvarna)" },
  { id: "garmin", label: "Garmin Connect" },
  { id: "roborock", label: "Roborock" },
  { id: "strava", label: "Strava" },
  { id: "netatmo", label: "Netatmo" },
  { id: "tibber", label: "Tibber" },
  { id: "met", label: "Met.no" },
  { id: "nrk", label: "NRK trafikk" },
  { id: "spot", label: "Spotpris" },
  { id: "lightning", label: "Lyn / radar" },
  { id: "garbage", label: "Renovasjon" },
  { id: "kassal", label: "Kassalapp" },
  { id: "ai", label: "AI" },
  { id: "posten", label: "Posten" },
  { id: "geoip", label: "GeoIP" },
  { id: "uv", label: "UV" },
];

export function ApiPausePanel() {
  const fetchFlags = useServerFn(getApiPauseFlags);
  const setFlag = useServerFn(setApiSourcePaused);
  const [flags, setFlags] = useState<Map<string, ApiPauseFlag>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchFlags();
      const m = new Map<string, ApiPauseFlag>();
      for (const f of res.flags) m.set(f.source, f);
      setFlags(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchFlags]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async (source: string, paused: boolean) => {
    setBusy(source);
    setError(null);
    try {
      await setFlag({ data: { source, paused } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(
    () =>
      SOURCES.map((s) => {
        const f = flags.get(s.id);
        return { ...s, paused: Boolean(f?.paused), updatedAt: f?.updated_at ?? null };
      }),
    [flags],
  );

  const pausedCount = rows.filter((r) => r.paused).length;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground italic">
        Når en kilde er pauset blokkeres ALLE serverkall til den —
        uavhengig av hvilken side du er på. Status oppdateres på serveren
        innen ~15 sekunder. {pausedCount > 0 && (
          <span className="text-destructive not-italic"> · {pausedCount} pauset nå</span>
        )}
      </p>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          ⚠ {error}
        </div>
      )}

      <ul className="divide-y divide-border/60 rounded border border-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                r.paused ? "bg-destructive" : "bg-primary animate-pulse"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-foreground">{r.label}</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {r.id}
                {r.updatedAt && (
                  <> · endret {new Date(r.updatedAt).toLocaleString("nb-NO")}</>
                )}
              </div>
            </div>
            <span
              className={`text-[10px] tracking-[0.2em] uppercase shrink-0 ${
                r.paused ? "text-destructive" : "text-primary"
              }`}
            >
              {r.paused ? "Pauset" : "Åpen"}
            </span>
            <button
              type="button"
              onClick={() => toggle(r.id, !r.paused)}
              disabled={busy === r.id}
              className={`px-3 py-1 rounded border text-[10px] tracking-[0.2em] uppercase shrink-0 hover:bg-primary/10 disabled:opacity-50 ${
                r.paused
                  ? "border-primary/50 text-primary"
                  : "border-destructive/50 text-destructive"
              }`}
            >
              {busy === r.id ? "…" : r.paused ? "✦ Åpne" : "○ Pause"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

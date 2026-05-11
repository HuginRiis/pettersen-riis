import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Wifi, WifiOff, Battery, RefreshCw } from "lucide-react";
import { getRoborockSnapshot } from "@/server/roborock.functions";

type Snap = Awaited<ReturnType<typeof getRoborockSnapshot>>;

const STATE_LABEL: Record<number, string> = {
  1: "Starter",
  2: "Lader (avbrutt)",
  3: "Inaktiv",
  4: "Fjernstyrt",
  5: "Renser",
  6: "Returnerer til dokk",
  7: "Manuell modus",
  8: "Lader",
  9: "Lade-feil",
  10: "Pause",
  11: "Sone-rens",
  12: "Feil",
  13: "Skrur av",
  14: "Oppdaterer",
  15: "Dokker",
  16: "Går til punkt",
  17: "Sone-rens",
  18: "Rom-rens",
  22: "Tømmer støv",
  23: "Vasker mopp",
  26: "Returnerer for å vaske mopp",
};

export function RoborockPanel() {
  const fetchSnap = useServerFn(getRoborockSnapshot);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetchSnap();
      setSnap(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-primary" />
          <h3 className="text-foreground font-semibold flex-1">Roborock S7</h3>
          <button
            onClick={load}
            disabled={loading}
            className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary/60 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Oppdater
          </button>
        </div>

        {loading && !snap && (
          <div className="text-xs text-muted-foreground mt-3">Henter status fra Roborock-skyen…</div>
        )}

        {snap && !snap.ok && (
          <div className="mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
            Kunne ikke koble til Roborock: {snap.error}
          </div>
        )}

        {snap?.ok && snap.devices.length === 0 && (
          <div className="text-xs text-muted-foreground mt-3">Ingen enheter funnet på kontoen.</div>
        )}

        {snap?.ok && snap.devices.length > 0 && (
          <div className="mt-3 space-y-2">
            {snap.devices.map((d) => {
              const status = (d.attribute ?? {}) as any;
              const state = typeof status?.state === "number" ? status.state : null;
              const battery = typeof status?.battery === "number" ? status.battery : null;
              return (
                <div key={d.duid} className="rounded-lg border border-border bg-card/30 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground flex-1 truncate">{d.name}</span>
                    {d.online ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                        <Wifi size={10} /> ONLINE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <WifiOff size={10} /> OFFLINE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mt-1">
                    {d.productName ?? "Roborock"}{d.fv ? ` · v${d.fv}` : ""}
                  </div>
                  <div className="flex gap-3 mt-2 text-xs">
                    {battery != null && (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <Battery size={12} className="text-primary" /> {battery}%
                      </span>
                    )}
                    {state != null && (
                      <span className="text-muted-foreground">
                        Tilstand: <span className="text-foreground">{STATE_LABEL[state] ?? `kode ${state}`}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground/70 mt-2">
              Kun lese-tilgang i denne versjonen. Kommandoer (start/dokk) krever MQTT og kommer i neste steg.
            </p>
          </div>
        )}
      </article>
    </section>
  );
}

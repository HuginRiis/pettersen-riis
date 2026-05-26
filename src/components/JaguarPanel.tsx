import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Car, Loader2, RefreshCw, Lock, Unlock, Wind, WindOff, Bell, MapPin, Gauge, Battery, Fuel } from "lucide-react";
import { getJaguarSnapshot, getJaguarHistory, sendJaguarCommandFn } from "@/server/jaguar.functions";

type Snap = Awaited<ReturnType<typeof getJaguarSnapshot>>;
type Hist = Awaited<ReturnType<typeof getJaguarHistory>>;

const CMDS: Array<{ key: "LOCK" | "UNLOCK" | "CLIMATE_START" | "CLIMATE_STOP" | "HONK_FLASH"; label: string; icon: typeof Lock }> = [
  { key: "LOCK", label: "Lås", icon: Lock },
  { key: "UNLOCK", label: "Lås opp", icon: Unlock },
  { key: "CLIMATE_START", label: "Start klima", icon: Wind },
  { key: "CLIMATE_STOP", label: "Stopp klima", icon: WindOff },
  { key: "HONK_FLASH", label: "Tut & blink", icon: Bell },
];

function fmt(v: number | null | undefined, suffix = "") {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}${suffix}`;
}

export function JaguarPanel() {
  const fetchSnap = useServerFn(getJaguarSnapshot);
  const fetchHist = useServerFn(getJaguarHistory);
  const send = useServerFn(sendJaguarCommandFn);

  const [snap, setSnap] = useState<Snap | null>(null);
  const [hist, setHist] = useState<Hist | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([fetchSnap(), fetchHist()]);
      setSnap(s);
      setHist(h);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const lastByVin = useMemo(() => {
    const map = new Map<string, any[]>();
    (hist?.ok ? hist.rows : []).forEach((r: any) => {
      if (!r.vin) return;
      const arr = map.get(r.vin) ?? [];
      arr.push(r);
      map.set(r.vin, arr);
    });
    return map;
  }, [hist]);

  const runCmd = async (vin: string, command: typeof CMDS[number]["key"]) => {
    setBusy(`${vin}:${command}`);
    setMsg(null);
    const r = await send({ data: { vin, command } });
    setBusy(null);
    setMsg(r.ok ? `✓ ${command} sendt` : `✗ ${command}: ${r.error}`);
    if (r.ok) setTimeout(load, 4000);
  };

  return (
    <section className="container mx-auto px-4 pt-4 space-y-4">
      <article className="panel rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Car size={18} className="text-primary" />
          <h3 className="text-foreground font-semibold flex-1">Jaguar Remote</h3>
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
          <div className="text-xs text-muted-foreground">Henter status fra InControl…</div>
        )}

        {snap && !snap.ok && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
            Kunne ikke hente status: {snap.error}
          </div>
        )}

        {snap?.ok && snap.vehicles.length === 0 && (
          <div className="text-xs text-muted-foreground">Fant ingen biler på kontoen.</div>
        )}

        {snap?.ok && snap.vehicles.map((v) => {
          const FuelIcon = v.fuelType?.toLowerCase().includes("electric") ? Battery : Fuel;
          return (
            <div key={v.vin} className="rounded-lg border border-border bg-card/30 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground flex-1 truncate">
                  {v.nickname ?? v.registrationNumber ?? v.vin}
                </span>
                {v.registrationNumber && (
                  <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                    {v.registrationNumber}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded border border-border bg-background/40 px-3 py-2">
                  <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground flex items-center gap-1">
                    <FuelIcon size={11} className="text-primary" />
                    {v.fuelType?.toLowerCase().includes("electric") ? "Lade" : "Drivstoff"}
                  </div>
                  <div className="text-foreground text-base font-semibold">{fmt(v.level, "%")}</div>
                </div>
                <div className="rounded border border-border bg-background/40 px-3 py-2">
                  <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground flex items-center gap-1">
                    <Gauge size={11} className="text-primary" /> Rekkevidde
                  </div>
                  <div className="text-foreground text-base font-semibold">{fmt(v.rangeKm, " km")}</div>
                </div>
                <div className="rounded border border-border bg-background/40 px-3 py-2">
                  <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground flex items-center gap-1">
                    <Gauge size={11} className="text-primary" /> Km-stand
                  </div>
                  <div className="text-foreground text-base font-semibold">{fmt(v.odometerKm, " km")}</div>
                </div>
                <div className="rounded border border-border bg-background/40 px-3 py-2">
                  <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground flex items-center gap-1">
                    {v.locked ? <Lock size={11} className="text-primary" /> : <Unlock size={11} className="text-destructive" />}
                    Lås
                  </div>
                  <div className="text-foreground text-base font-semibold">
                    {v.locked == null ? "—" : v.locked ? "Låst" : "Ulåst"}
                  </div>
                </div>
              </div>

              {v.position && (
                <a
                  href={`https://maps.google.com/?q=${v.position.lat},${v.position.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                >
                  <MapPin size={11} /> {v.position.lat.toFixed(5)}, {v.position.lon.toFixed(5)}
                </a>
              )}

              <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                {CMDS.map((c) => {
                  const Icon = c.icon;
                  const key = `${v.vin}:${c.key}`;
                  return (
                    <button
                      key={c.key}
                      onClick={() => runCmd(v.vin, c.key)}
                      disabled={busy !== null}
                      className="text-xs inline-flex items-center gap-1 px-3 py-2 rounded border border-border hover:border-primary/60 disabled:opacity-50"
                    >
                      {busy === key ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
                      {c.label}
                    </button>
                  );
                })}
              </div>

              {(() => {
                const rows = lastByVin.get(v.vin) ?? [];
                if (rows.length === 0) return null;
                return (
                  <div className="text-[10px] text-muted-foreground">
                    {rows.length} loggførte snapshots siste 7 dager · sist {new Date(rows[0].fetched_at).toLocaleString("nb-NO")}
                  </div>
                );
              })()}
            </div>
          );
        })}

        {msg && (
          <div className="text-[11px] px-3 py-2 rounded border border-border bg-card/40 text-foreground">
            {msg}
          </div>
        )}

        <div className="text-[10px] text-muted-foreground">
          Synkroniseres automatisk én gang i timen via Lovable Cloud.
        </div>
      </article>
    </section>
  );
}

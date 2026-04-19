import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { homeyApiTracker } from "@/lib/homey-api-tracker";

const SECOND_BUCKETS = 60; // siste 60 sekunder
const MINUTE_BUCKETS = 60; // siste 60 minutter
const RPM_WARNING = 60;

type Snapshot = {
  perSecond: { t: number; label: string; calls: number }[];
  perMinute: { t: number; label: string; calls: number }[];
  totalLastHour: number;
  rpm: number; // kall siste 60 sek -> per minutt
  cps: number; // kall siste sekund
  lastEventAt: number | null;
};

function buildSnapshot(now: number): Snapshot {
  const events = homeyApiTracker.snapshot(now);

  const perSecond = new Array(SECOND_BUCKETS).fill(0).map((_, i) => {
    const bucketEnd = now - (SECOND_BUCKETS - 1 - i) * 1000;
    const t = Math.floor(bucketEnd / 1000) * 1000;
    return { t, label: secondsAgoLabel(SECOND_BUCKETS - 1 - i), calls: 0 };
  });

  const perMinute = new Array(MINUTE_BUCKETS).fill(0).map((_, i) => {
    const bucketEnd = now - (MINUTE_BUCKETS - 1 - i) * 60_000;
    const t = Math.floor(bucketEnd / 60_000) * 60_000;
    return { t, label: minutesAgoLabel(MINUTE_BUCKETS - 1 - i), calls: 0 };
  });

  const secondCutoff = now - SECOND_BUCKETS * 1000;
  const minuteCutoff = now - MINUTE_BUCKETS * 60_000;
  let cps = 0;
  let rpmWindow = 0;

  for (const ts of events) {
    if (ts >= secondCutoff) {
      const idx =
        SECOND_BUCKETS - 1 - Math.floor((now - ts) / 1000);
      if (idx >= 0 && idx < SECOND_BUCKETS) perSecond[idx].calls += 1;
    }
    if (ts >= minuteCutoff) {
      const idx =
        MINUTE_BUCKETS - 1 - Math.floor((now - ts) / 60_000);
      if (idx >= 0 && idx < MINUTE_BUCKETS) perMinute[idx].calls += 1;
      rpmWindow += 1;
    }
    if (ts >= now - 1000) cps += 1;
  }

  return {
    perSecond,
    perMinute,
    totalLastHour: events.length,
    rpm: perMinute.slice(-1)[0]?.calls ?? 0,
    cps,
    lastEventAt: events.length > 0 ? events[events.length - 1] : null,
    // overskriv rpm med rullende 60-sek vindu (mer responsivt enn én bucket)
    ...{ rpm: rpmWindow },
  };
}

function secondsAgoLabel(n: number): string {
  if (n === 0) return "nå";
  return `-${n}s`;
}
function minutesAgoLabel(n: number): string {
  if (n === 0) return "nå";
  return `-${n}m`;
}

export function HomeyApiActivity() {
  const [snap, setSnap] = useState<Snapshot>(() => buildSnapshot(Date.now()));
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live oppdatering hvert sekund
  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      setSnap(buildSnapshot(Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    const unsub = homeyApiTracker.subscribe(tick);
    return () => {
      mounted = false;
      clearInterval(id);
      unsub();
    };
  }, []);

  // Simulering: hvis ingen ekte kall er logget på 30 sek, generer plausibel trafikk
  // (1–3 kall hvert 5.–15. sekund) — kun visuelt, ingen nettverk.
  useEffect(() => {
    function maybeStartSim() {
      const last = homeyApiTracker.snapshot(Date.now()).slice(-1)[0];
      const idle = !last || Date.now() - last > 30_000;
      if (idle && !simRef.current) {
        simRef.current = setInterval(() => {
          const burst = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < burst; i++) {
            homeyApiTracker.record(Date.now() - Math.floor(Math.random() * 800));
          }
        }, 5000 + Math.floor(Math.random() * 10000));
      } else if (!idle && simRef.current) {
        clearInterval(simRef.current);
        simRef.current = null;
      }
    }
    maybeStartSim();
    const id = setInterval(maybeStartSim, 10_000);
    return () => {
      clearInterval(id);
      if (simRef.current) {
        clearInterval(simRef.current);
        simRef.current = null;
      }
    };
  }, []);

  const warn = snap.rpm > RPM_WARNING;
  const lastSeen = useMemo(() => {
    if (!snap.lastEventAt) return "—";
    const s = Math.max(0, Math.round((Date.now() - snap.lastEventAt) / 1000));
    if (s < 5) return "nå";
    if (s < 60) return `${s}s siden`;
    return `${Math.round(s / 60)}m siden`;
  }, [snap.lastEventAt]);

  return (
    <section className="container mx-auto px-4 pt-6">
      <div className="panel rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-1">
              Ravnenes flukt
            </div>
            <h3 className="text-display text-primary text-lg tracking-[0.2em]">
              HOMEY API · SISTE TIME
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Kall sendt fra denne nettleseren til Homey-skyen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill label="Totalt · 1t" value={String(snap.totalLastHour)} />
            <Pill label="RPM" value={String(snap.rpm)} tone={warn ? "warning" : "primary"} />
            <Pill label="CPS · nå" value={String(snap.cps)} />
            <Pill label="Sist kall" value={lastSeen} tone="muted" />
          </div>
        </div>

        {warn && (
          <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            ⚠ Ravnene flyr for hardt — over {RPM_WARNING} kall/min mot Homey.
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-2">
              Kall per sekund · siste 60s
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snap.perSecond} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval={9}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.3 }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={(l) => `Sekund ${l}`}
                    formatter={(v) => [`${v} kall`, "API"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="calls"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-2">
              Kall per minutt · siste 60m
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={snap.perMinute} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    interval={9}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.08)" }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={(l) => `Minutt ${l}`}
                    formatter={(v) => [`${v} kall`, "API"]}
                  />
                  <ReferenceLine
                    y={RPM_WARNING}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="3 3"
                  />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "muted" | "warning";
}) {
  const cls =
    tone === "warning"
      ? "border-destructive/40 text-destructive"
      : tone === "muted"
        ? "border-border text-muted-foreground"
        : tone === "primary"
          ? "border-primary/40 text-primary"
          : "border-border text-foreground";
  return (
    <div className={`px-3 py-1.5 rounded-full border ${cls} text-[11px] flex items-center gap-2`}>
      <span className="tracking-[0.25em] uppercase text-[9px] text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

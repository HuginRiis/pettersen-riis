import { useEffect, useMemo, useState } from "react";
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

// Oransje aksent for Homey-aktivitetsgrafen.
const ACCENT = "hsl(28 90% 58%)";
const ACCENT_SOFT = "hsl(28 90% 58% / 0.12)";

type Snapshot = {
  perSecond: { t: number; label: string; calls: number }[];
  perMinute: { t: number; label: string; calls: number }[];
  totalLastHour: number;
  rpm: number; // kall siste 60 sek -> per minutt
  cps: number; // kall siste sekund
  lastEventAt: number | null;
};

function emptySnapshot(): Snapshot {
  return {
    perSecond: new Array(SECOND_BUCKETS).fill(0).map((_, i) => ({
      t: i,
      label: secondsAgoLabel(SECOND_BUCKETS - 1 - i),
      calls: 0,
    })),
    perMinute: new Array(MINUTE_BUCKETS).fill(0).map((_, i) => ({
      t: i,
      label: minutesAgoLabel(MINUTE_BUCKETS - 1 - i),
      calls: 0,
    })),
    totalLastHour: 0,
    rpm: 0,
    cps: 0,
    lastEventAt: null,
  };
}

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
      const idx = SECOND_BUCKETS - 1 - Math.floor((now - ts) / 1000);
      if (idx >= 0 && idx < SECOND_BUCKETS) perSecond[idx].calls += 1;
    }
    if (ts >= minuteCutoff) {
      const idx = MINUTE_BUCKETS - 1 - Math.floor((now - ts) / 60_000);
      if (idx >= 0 && idx < MINUTE_BUCKETS) perMinute[idx].calls += 1;
      rpmWindow += 1;
    }
    if (ts >= now - 1000) cps += 1;
  }

  return {
    perSecond,
    perMinute,
    totalLastHour: events.length,
    rpm: rpmWindow,
    cps,
    lastEventAt: events.length > 0 ? events[events.length - 1] : null,
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
  // Start med tom snapshot for å unngå hydration-mismatch (Date.now() er ulikt
  // på server og klient). Live data kommer på første tick i useEffect.
  const [snap, setSnap] = useState<Snapshot>(() => emptySnapshot());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setSnap(buildSnapshot(Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    const unsub = homeyApiTracker.subscribe(tick);
    return () => {
      alive = false;
      clearInterval(id);
      unsub();
    };
  }, []);

  const warn = snap.rpm > RPM_WARNING;
  const lastSeen = useMemo(() => {
    if (!mounted || !snap.lastEventAt) return "—";
    const s = Math.max(0, Math.round((Date.now() - snap.lastEventAt) / 1000));
    if (s < 5) return "nå";
    if (s < 60) return `${s}s siden`;
    return `${Math.round(s / 60)}m siden`;
  }, [snap.lastEventAt, mounted]);

  return (
    <section className="container mx-auto px-4 pt-6">
      <div className="panel rounded-lg p-6" style={{ borderColor: ACCENT_SOFT }}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div
              className="text-[10px] tracking-[0.3em] uppercase mb-1"
              style={{ color: ACCENT }}
            >
              Ravnenes flukt
            </div>
            <h3
              className="text-display text-lg tracking-[0.2em]"
              style={{ color: ACCENT }}
            >
              HOMEY API · SISTE TIME
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Faktiske kall fra denne nettleseren mot Homey-skyen. Cache: 3 min.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill label="Totalt · 1t" value={String(snap.totalLastHour)} />
            <Pill label="RPM" value={String(snap.rpm)} tone={warn ? "warning" : "accent"} />
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
                <LineChart
                  data={snap.perSecond}
                  margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="2 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    interval={9}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip trigger="click"
                    cursor={{ stroke: ACCENT, strokeOpacity: 0.4 }}
                    contentStyle={{
                      background: "var(--card)",
                      border: `1px solid ${ACCENT}`,
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={(l) => `Sekund ${l}`}
                    formatter={(v) => [`${v} kall`, "API"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="calls"
                    stroke={ACCENT}
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
                <BarChart
                  data={snap.perMinute}
                  margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="2 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    interval={9}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip trigger="click"
                    cursor={{ fill: ACCENT_SOFT }}
                    contentStyle={{
                      background: "var(--card)",
                      border: `1px solid ${ACCENT}`,
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={(l) => `Minutt ${l}`}
                    formatter={(v) => [`${v} kall`, "API"]}
                  />
                  <ReferenceLine
                    y={RPM_WARNING}
                    stroke="var(--destructive)"
                    strokeDasharray="3 3"
                  />
                  <Bar
                    dataKey="calls"
                    fill={ACCENT}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
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
  tone?: "default" | "accent" | "muted" | "warning";
}) {
  const style: React.CSSProperties =
    tone === "accent"
      ? { borderColor: ACCENT, color: ACCENT }
      : tone === "warning"
        ? {}
        : {};
  const cls =
    tone === "warning"
      ? "border-destructive/40 text-destructive"
      : tone === "muted"
        ? "border-border text-muted-foreground"
        : tone === "accent"
          ? "border"
          : "border-border text-foreground";
  return (
    <div
      className={`px-3 py-1.5 rounded-full border ${cls} text-[11px] flex items-center gap-2`}
      style={style}
    >
      <span className="tracking-[0.25em] uppercase text-[9px] text-muted-foreground">
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

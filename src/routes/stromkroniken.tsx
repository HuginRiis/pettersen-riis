import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import {
  Crown,
  Zap,
  Coins,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Sparkles,
  Bolt,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { getPowerByTheHour, type PbthHomeData, type PbthResult } from "@/server/power-by-the-hour";
import stromImg from "@/assets/stromkroniken.jpg";

export const Route = createFileRoute("/stromkroniken")({
  head: () => ({
    meta: [
      { title: "Strømkrøniken — House Pettersen Riis" },
      {
        name: "description",
        content:
          "Husets krønike om strømgullet — sanntidspris, forbruk og kostnader for borgen og hytta, hentet fra Power by the Hour-app via Homey.",
      },
      { property: "og:title", content: "Strømkrøniken — House Pettersen Riis" },
      {
        property: "og:description",
        content:
          "Sanntidspris, forbruk og strømkostnader for borgen og hytta — kalkulert av Power by the Hour-app i Homey.",
      },
      { property: "og:image", content: stromImg },
      { property: "twitter:image", content: stromImg },
    ],
  }),
  component: StromkronikenPage,
});

function StromkronikenPage() {
  const fetchData = useServerFn(getPowerByTheHour);
  const [state, setState] = useState<PbthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = async () => {
    try {
      const res = await fetchData();
      setState(res);
      setUpdated(new Date());
    } catch (err) {
      console.error("[Stromkroniken] failed", err);
      setState({ ok: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets strømgull · Anno nå"
        title="Strømkrøniken"
        subtitle="Krøniken om strømmen som rir gjennom borgens årer — sanntidspris, forbruk og kostnader for begge husene."
        image={stromImg}
      />

      <section className="container mx-auto px-4 py-10 max-w-6xl space-y-10">
        {loading && !state && (
          <div className="text-center text-muted-foreground py-20">
            <div className="inline-flex items-center gap-2 text-sm">
              <RefreshCw size={14} className="animate-spin" /> Spør ravnen om Power-by-the-Hour…
            </div>
          </div>
        )}

        {state && !state.ok && (
          <article className="panel rounded-lg p-6 border-destructive/40">
            <h2 className="text-xl text-primary mb-2 flex items-center gap-2">
              <AlertTriangle size={18} className="text-destructive" /> Krøniken er taus
            </h2>
            <p className="text-foreground/85 text-sm">{state.error}</p>
          </article>
        )}

        {state && state.ok && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-muted-foreground">
                Maesterens timesvise målinger — oppdatert{" "}
                <span className="text-primary">
                  {updated?.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) ?? "—"}
                </span>
              </p>
              <button
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
                className="text-xs tracking-[0.25em] uppercase text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md hover:border-primary/60"
              >
                <RefreshCw size={12} /> Oppdater
              </button>
            </div>

            <HomeBlock
              title="Borgen · Nordre Lensmannsveg 17"
              eyebrow="Husets sete"
              data={state.borgen}
            />
            <HomeBlock
              title="Hytta · Øvre Bjørkesetvegen 222"
              eyebrow="Vinterboligen"
              data={state.hytta}
            />

            <ComparisonBlock borgen={state.borgen} hytta={state.hytta} />
          </>
        )}
      </section>
    </PageShell>
  );
}

// ============================================================
// Home block — full visualization for a single address
// ============================================================

function HomeBlock({
  title,
  eyebrow,
  data,
}: {
  title: string;
  eyebrow: string;
  data: PbthHomeData;
}) {
  if (!data.found) {
    return (
      <article className="panel rounded-lg p-6">
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          {eyebrow}
        </div>
        <h2 className="text-2xl text-primary mt-1 mb-3 flex items-center gap-2">
          <Crown size={20} /> {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          Fant ingen Power-by-the-Hour-enhet i Homey som matcher denne adressen.
          Kontroller at appen er installert og at enheten har adressen i navnet.
        </p>
      </article>
    );
  }

  const h = data.highlights;

  return (
    <article className="panel rounded-lg p-5 sm:p-7 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            {eyebrow}
          </div>
          <h2 className="text-2xl text-primary mt-1 flex items-center gap-2">
            <Crown size={20} /> {title}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Enhet i Homey: <span className="text-foreground/80">{data.matchedDeviceName}</span>
          </p>
        </div>
      </div>

      {/* Heltall — store nøkkeltall */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat
          icon={Coins}
          label="Pris nå"
          value={h.priceNow != null ? `${h.priceNow.toFixed(3)} kr` : "—"}
          sub="per kWh inkl. mva"
          tone="gold"
        />
        <BigStat
          icon={Bolt}
          label="Effekt nå"
          value={h.consumptionNow != null ? `${Math.round(h.consumptionNow)} W` : "—"}
          sub="øyeblikkelig last"
          tone="primary"
        />
        <BigStat
          icon={Zap}
          label="kWh i dag"
          value={h.energyToday != null ? h.energyToday.toFixed(1) : "—"}
          sub="forbruk så langt"
          tone="primary"
        />
        <BigStat
          icon={Coins}
          label="Kostnad i dag"
          value={h.costToday != null ? `${h.costToday.toFixed(0)} kr` : "—"}
          sub="påløpt så langt"
          tone="gold"
        />
      </div>

      {/* Pris-radialer */}
      {(h.priceNow != null || h.priceMinToday != null || h.priceMaxToday != null) && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <Sparkles size={14} /> Prisens posisjon i dag
          </h3>
          <PriceRadial
            now={h.priceNow}
            min={h.priceMinToday}
            max={h.priceMaxToday}
            avg={h.priceAvgToday}
          />
        </div>
      )}

      {/* Kostnad-graf */}
      <div>
        <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
          <Calendar size={14} /> Kostnad over tid
        </h3>
        <CostBars highlights={h} />
      </div>

      {/* Forbruk-graf */}
      <div>
        <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
          <TrendingUp size={14} /> Energiforbruk over tid
        </h3>
        <EnergyBars highlights={h} />
      </div>

      {/* Daglig sammenligning */}
      <div>
        <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
          <TrendingDown size={14} /> I dag mot i går
        </h3>
        <DayDeltaPanel highlights={h} />
      </div>

      {/* Måneds-prognose */}
      <div>
        <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
          <Sparkles size={14} /> Månedens spådom
        </h3>
        <MonthForecastPanel highlights={h} />
      </div>

      {/* Alle capabilities — tabell */}
      <details className="group">
        <summary className="cursor-pointer text-sm tracking-[0.3em] uppercase text-primary flex items-center gap-2 hover:text-gold transition-colors">
          <Clock size={14} /> Alle målinger fra Maesteren ({data.capabilities.length})
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {data.capabilities.map((c) => (
            <div
              key={c.id}
              className="rounded-md border border-border/40 bg-background/30 p-2.5"
            >
              <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                {c.label}
              </div>
              <div className="text-sm text-foreground tabular-nums mt-0.5">
                {formatValue(c.value)} {c.unit ? <span className="text-xs text-muted-foreground">{c.unit}</span> : null}
              </div>
              <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">{c.id}</div>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

function formatValue(v: number | string | boolean | null): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "På" : "Av";
  if (typeof v === "number") {
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(3);
  }
  return String(v);
}

function BigStat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  sub: string;
  tone: "gold" | "primary";
}) {
  const color = tone === "gold" ? "text-[oklch(0.78_0.13_85)]" : "text-primary";
  return (
    <div className="panel rounded-md p-4 bg-background/40 border border-border/40">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
          {label}
        </div>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function PriceRadial({
  now,
  min,
  max,
  avg,
}: {
  now?: number;
  min?: number;
  max?: number;
  avg?: number;
}) {
  // Vis hvor "nå-prisen" ligger mellom min og max i dag.
  const lo = min ?? 0;
  const hi = max ?? Math.max((now ?? 0) * 1.5, 1);
  const pos = now != null && hi > lo ? Math.min(1, Math.max(0, (now - lo) / (hi - lo))) : 0;
  const pct = Math.round(pos * 100);

  const data = [{ name: "pris", value: pct, fill: pctColor(pct) }];

  return (
    <div className="grid md:grid-cols-[220px,1fr] gap-4 items-center">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={data}
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "hsl(var(--muted) / 0.2)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="-mt-32 text-center pointer-events-none">
          <div className="text-2xl font-semibold text-foreground tabular-nums">{pct}%</div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            av dagens spenn
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <PriceBox icon={TrendingDown} label="Lavest i dag" value={min} tone="emerald" />
        <PriceBox icon={Sparkles} label="Snitt i dag" value={avg} tone="muted" />
        <PriceBox icon={TrendingUp} label="Høyest i dag" value={max} tone="rose" />
      </div>
    </div>
  );
}

function pctColor(pct: number): string {
  if (pct < 33) return "oklch(0.72 0.16 150)"; // grønn
  if (pct < 66) return "oklch(0.78 0.13 85)"; // gull
  return "oklch(0.65 0.22 25)"; // rødglødende
}

function PriceBox({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value?: number;
  tone: "emerald" | "muted" | "rose";
}) {
  const color =
    tone === "emerald"
      ? "text-[oklch(0.72_0.16_150)]"
      : tone === "rose"
        ? "text-[oklch(0.65_0.22_25)]"
        : "text-foreground";
  return (
    <div className="panel rounded-md p-3 bg-background/30 border border-border/40 text-center">
      <Icon size={14} className={`${color} mx-auto mb-1`} />
      <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${color}`}>
        {value != null ? `${value.toFixed(3)} kr` : "—"}
      </div>
    </div>
  );
}

function CostBars({ highlights: h }: { highlights: PbthHomeData["highlights"] }) {
  const data = [
    { label: "I går", value: h.costYesterday ?? 0, color: "oklch(0.65 0.04 250)" },
    { label: "I dag", value: h.costToday ?? 0, color: "oklch(0.62 0.18 250)" },
    { label: "Forrige måned", value: h.costLastMonth ?? 0, color: "oklch(0.65 0.04 250)" },
    { label: "Denne måneden", value: h.costThisMonth ?? 0, color: "oklch(0.62 0.18 250)" },
    { label: "I år", value: h.costThisYear ?? 0, color: "oklch(0.78 0.13 85)" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Ingen kostnadsdata tilgjengelig.</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={48} unit=" kr" />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v.toFixed(0)} kr`, "Kostnad"]}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EnergyBars({ highlights: h }: { highlights: PbthHomeData["highlights"] }) {
  const data = [
    { label: "I går", value: h.energyYesterday ?? 0 },
    { label: "I dag", value: h.energyToday ?? 0 },
    { label: "Forrige måned", value: h.energyLastMonth ?? 0 },
    { label: "Denne måneden", value: h.energyThisMonth ?? 0 },
    { label: "I år", value: h.energyThisYear ?? 0 },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Ingen forbruksdata tilgjengelig.</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={48} unit=" kWh" />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v.toFixed(1)} kWh`, "Forbruk"]}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} fill="oklch(0.62 0.18 250)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// Day delta — today vs yesterday
// ============================================================

function DayDeltaPanel({ highlights: h }: { highlights: PbthHomeData["highlights"] }) {
  const eToday = h.energyToday ?? 0;
  const eYest = h.energyYesterday ?? 0;
  const cToday = h.costToday ?? 0;
  const cYest = h.costYesterday ?? 0;

  if (eToday === 0 && eYest === 0) {
    return <p className="text-xs text-muted-foreground">Ingen data å sammenligne ennå.</p>;
  }

  const energyDelta = eYest > 0 ? ((eToday - eYest) / eYest) * 100 : 0;
  const costDelta = cYest > 0 ? ((cToday - cYest) / cYest) * 100 : 0;

  const data = [
    { label: "kWh", "I går": eYest, "I dag": eToday },
    { label: "kr", "I går": cYest, "I dag": cToday },
  ];

  return (
    <div className="grid md:grid-cols-[1fr,200px] gap-4 items-center">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={40} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Bar dataKey="I går" fill="oklch(0.65 0.04 250)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="I dag" fill="oklch(0.62 0.18 250)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        <DeltaBadge label="Energi" delta={energyDelta} />
        <DeltaBadge label="Kostnad" delta={costDelta} />
      </div>
    </div>
  );
}

function DeltaBadge({ label, delta }: { label: string; delta: number }) {
  const up = delta > 0;
  const flat = Math.abs(delta) < 0.5;
  const color = flat
    ? "text-muted-foreground"
    : up
      ? "text-[oklch(0.65_0.22_25)]"
      : "text-[oklch(0.72_0.16_150)]";
  const Icon = flat ? Sparkles : up ? TrendingUp : TrendingDown;
  return (
    <div className="panel rounded-md p-3 bg-background/30 border border-border/40">
      <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 flex items-center gap-1.5 ${color}`}>
        <Icon size={14} />
        {flat ? "≈ 0%" : `${up ? "+" : ""}${delta.toFixed(1)}%`}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">vs i går</div>
    </div>
  );
}

// ============================================================
// Month forecast — projection based on daily pace
// ============================================================

function MonthForecastPanel({ highlights: h }: { highlights: PbthHomeData["highlights"] }) {
  const energyMonth = h.energyThisMonth;
  const costMonth = h.costThisMonth;
  if (energyMonth == null && costMonth == null) {
    return <p className="text-xs text-muted-foreground">Ingen månedsdata tilgjengelig.</p>;
  }

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const fraction = dayOfMonth / daysInMonth;

  const projectedEnergy = energyMonth != null ? energyMonth / fraction : undefined;
  const projectedCost = costMonth != null ? costMonth / fraction : undefined;
  const remainingCost =
    projectedCost != null && costMonth != null ? projectedCost - costMonth : undefined;

  const pctOfMonth = Math.round(fraction * 100);

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="panel rounded-md p-4 bg-background/30 border border-border/40">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
          Energi · spådom for måneden
        </div>
        <div className="text-2xl font-semibold tabular-nums text-primary mt-1">
          {projectedEnergy != null ? `${projectedEnergy.toFixed(0)} kWh` : "—"}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Per nå: {energyMonth?.toFixed(0) ?? "—"} kWh · {pctOfMonth}% av måneden gått
        </div>
      </div>
      <div className="panel rounded-md p-4 bg-background/30 border border-border/40">
        <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
          Kostnad · spådom for måneden
        </div>
        <div className="text-2xl font-semibold tabular-nums text-[oklch(0.78_0.13_85)] mt-1">
          {projectedCost != null ? `${projectedCost.toFixed(0)} kr` : "—"}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Per nå: {costMonth?.toFixed(0) ?? "—"} kr · gjenstår ~{remainingCost?.toFixed(0) ?? "—"} kr
        </div>
        {h.derivedRate != null && (
          <div className="text-[10px] text-muted-foreground mt-2 italic">
            Kostnad estimert fra forbruk × {h.derivedRate.toFixed(2)} kr/kWh
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Comparison block
// ============================================================

function ComparisonBlock({
  borgen,
  hytta,
}: {
  borgen: PbthHomeData;
  hytta: PbthHomeData;
}) {
  if (!borgen.found && !hytta.found) return null;

  const rows: Array<{ label: string; b?: number; h?: number; unit: string; precision: number }> = [
    { label: "Effekt nå", b: borgen.highlights.consumptionNow, h: hytta.highlights.consumptionNow, unit: "W", precision: 0 },
    { label: "kWh i dag", b: borgen.highlights.energyToday, h: hytta.highlights.energyToday, unit: "kWh", precision: 1 },
    { label: "Kostnad i dag", b: borgen.highlights.costToday, h: hytta.highlights.costToday, unit: "kr", precision: 0 },
    { label: "kWh denne måneden", b: borgen.highlights.energyThisMonth, h: hytta.highlights.energyThisMonth, unit: "kWh", precision: 0 },
    { label: "Kostnad denne måneden", b: borgen.highlights.costThisMonth, h: hytta.highlights.costThisMonth, unit: "kr", precision: 0 },
    { label: "kWh i år", b: borgen.highlights.energyThisYear, h: hytta.highlights.energyThisYear, unit: "kWh", precision: 0 },
    { label: "Kostnad i år", b: borgen.highlights.costThisYear, h: hytta.highlights.costThisYear, unit: "kr", precision: 0 },
  ];

  const chartData = rows
    .filter((r) => (r.b ?? 0) > 0 || (r.h ?? 0) > 0)
    .filter((r) => r.unit === "kr")
    .map((r) => ({
      label: r.label.replace("Kostnad ", ""),
      Borgen: r.b ?? 0,
      Hytta: r.h ?? 0,
    }));

  return (
    <article className="panel rounded-lg p-5 sm:p-7 border-primary/30">
      <h2 className="text-2xl text-primary mb-4 flex items-center gap-2">
        <Crown size={20} /> De to husene side om side
      </h2>

      {chartData.length > 0 && (
        <div className="h-64 w-full mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} width={48} unit=" kr" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v.toFixed(0)} kr`, ""]}
              />
              <Bar dataKey="Borgen" fill="oklch(0.62 0.18 250)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Hytta" fill="oklch(0.78 0.13 85)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">
                Mål
              </th>
              <th className="text-right py-2 text-[10px] tracking-[0.25em] uppercase text-primary font-normal">
                Borgen
              </th>
              <th className="text-right py-2 text-[10px] tracking-[0.25em] uppercase text-[oklch(0.78_0.13_85)] font-normal">
                Hytta
              </th>
              <th className="text-right py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">
                Sum
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sum = (r.b ?? 0) + (r.h ?? 0);
              return (
                <tr key={r.label} className="border-b border-border/30 last:border-0">
                  <td className="py-2 text-foreground/85">{r.label}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">
                    {r.b != null ? `${r.b.toFixed(r.precision)} ${r.unit}` : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-foreground">
                    {r.h != null ? `${r.h.toFixed(r.precision)} ${r.unit}` : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums text-primary font-semibold">
                    {sum > 0 ? `${sum.toFixed(r.precision)} ${r.unit}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-4 italic">
        — Maesterens samlede regnskap, hentet fra Power-by-the-Hour i Homey.
      </p>
    </article>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Car,
  Upload,
  Loader2,
  Trash2,
  Gauge,
  Route as RouteIcon,
  Timer,
  BatteryCharging,
  Zap,
  MapPin,
  TrendingUp,
  CalendarDays,
  Clock,
  Leaf,
  Trophy,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  listCarTrips,
  importCarTrips,
  deleteCarTrip,
  clearCarTrips,
  type CarTrip,
} from "@/lib/car-trips.functions";
import {
  parseTripsCsv,
  computeStats,
  fmtHm,
  fmtKm,
  fmtKwh,
  type Bucket,
} from "@/lib/car-trip-stats";
import { PlacesMap } from "@/components/PlacesMap";
import heroImg from "@/assets/got-jaguar.jpg";

export const Route = createFileRoute("/jaguar")({
  head: () => ({
    meta: [
      { title: "Jaguar — Kjørelogg og statistikk | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Importer kjøreloggen fra Jaguaren og se snitt per dag, uke og måned, forbruk, regenerert energi, favorittruter og alle turer.",
      },
      { property: "og:title", content: "Jaguar — Kjørelogg og statistikk" },
      {
        property: "og:description",
        content: "Full oversikt over husets Jaguar: kilometer, forbruk, effektivitet og turhistorikk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JaguarPage,
});

const CHART_GRID = "hsl(var(--border))";
const AXIS = "hsl(var(--muted-foreground))";

const TABS = [
  { id: "oversikt", label: "Oversikt" },
  { id: "trender", label: "Trender" },
  { id: "monster", label: "Mønster" },
  { id: "turer", label: "Turer" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function JaguarPage() {
  const fetchTrips = useServerFn(listCarTrips);
  const doImport = useServerFn(importCarTrips);
  const doDelete = useServerFn(deleteCarTrip);
  const doClear = useServerFn(clearCarTrips);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("oversikt");
  const [q, setQ] = useState("");
  const [price, setPrice] = useState(1.4);

  const [trips, setTrips] = useState<CarTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchTrips();
      setTrips(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Klarte ikke hente kjøreloggen");
    } finally {
      setIsLoading(false);
    }
  }, [fetchTrips]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = useMemo(() => computeStats(trips), [trips]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = [...trips].sort(
      (a, b) => new Date(b.start_ts).getTime() - new Date(a.start_ts).getTime(),
    );
    if (!needle) return list.slice(0, 300);
    return list
      .filter((t) =>
        `${t.start_place ?? ""} ${t.end_place ?? ""} ${new Date(t.start_ts).toLocaleDateString("nb-NO")}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 300);
  }, [trips, q]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const { trips: parsed, skipped } = parseTripsCsv(text);
      if (parsed.length === 0) {
        toast.error("Fant ingen turer i filen. Er det riktig CSV fra bilen?");
        return;
      }
      let imported = 0;
      for (let i = 0; i < parsed.length; i += 400) {
        const res = await doImport({ data: { trips: parsed.slice(i, i + 400) } });
        imported += res.imported;
      }
      await reload();
      toast.success(
        `Importerte ${imported} nye turer av ${parsed.length} lest${skipped ? ` (${skipped} hoppet over)` : ""}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import feilet");
    } finally {
      setBusy(false);
    }
  }

  async function removeTrip(id: string) {
    await doDelete({ data: { id } });
    await reload();
    toast.success("Tur slettet");
  }

  async function clearAll() {
    if (!confirm("Slette hele kjøreloggen?")) return;
    setBusy(true);
    try {
      await doClear();
      await reload();
      toast.success("Kjøreloggen er tømt");
    } finally {
      setBusy(false);
    }
  }

  const cost = stats.totalKwh * price;

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets vogn"
        title="Jaguar"
        subtitle="Kjørelogg, forbruk og statistikk for den elektriske katten i borgen."
        image={heroImg}
      >
        <div className="flex flex-wrap gap-2 justify-center">
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Importer kjørelogg (CSV)
          </Button>
          {trips.length > 0 && (
            <Button variant="outline" onClick={clearAll} disabled={busy}>
              <Trash2 className="w-4 h-4 mr-2" />
              Tøm logg
            </Button>
          )}
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        </div>
      </PageHero>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Henter kjøreloggen …
          </div>
        ) : trips.length === 0 ? (
          <EmptyState onPick={() => fileRef.current?.click()} />
        ) : (
          <>
            {/* Nøkkeltall */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat icon={RouteIcon} label="Total distanse" value={fmtKm(stats.totalKm)} sub={`${stats.count} turer`} />
              <Stat icon={Timer} label="Tid bak rattet" value={fmtHm(stats.totalMinutes)} sub={`snitt ${fmtHm(stats.avgTripMin)} / tur`} />
              <Stat icon={Zap} label="Estimert forbruk" value={fmtKwh(stats.totalKwh)} sub={`${cost.toLocaleString("nb-NO", { maximumFractionDigits: 0 })} kr`} />
              <Stat icon={BatteryCharging} label="Regenerert" value={fmtKwh(stats.totalRegen)} sub={`${stats.totalKwh ? ((stats.totalRegen / stats.totalKwh) * 100).toFixed(0) : 0} % av forbruk`} />
              <Stat icon={Leaf} label="Effektivitet" value={`${stats.avgEfficiency.toFixed(1)} kWh/100 km`} sub={`${stats.totalKm ? (100 / stats.avgEfficiency).toFixed(1) : 0} km per 10 kWh`} />
              <Stat icon={Gauge} label="Snittfart" value={`${stats.avgSpeed.toFixed(1)} km/t`} sub={`snitt ${stats.avgTripKm.toFixed(1)} km / tur`} />
            </div>

            {/* Snitt per periode */}
            <section className="rounded-xl border border-border bg-card/60 backdrop-blur p-4">
              <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Gjennomsnittlig bruk
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Periode {stats.firstDate?.toLocaleDateString("nb-NO")} – {stats.lastDate?.toLocaleDateString("nb-NO")} ·{" "}
                {stats.spanDays} dager, hvorav {stats.activeDays} med kjøring.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <AvgCard title="Per dag" data={stats.avgPerDay} />
                <AvgCard title="Per kjøredag" data={stats.avgPerActiveDay} />
                <AvgCard title="Per uke" data={stats.avgPerWeek} />
                <AvgCard title="Per måned" data={stats.avgPerMonth} />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Strømpris (kr/kWh):</span>
                <Input
                  type="number"
                  step="0.05"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  className="h-8 w-24"
                />
                <span>
                  ≈ {(stats.avgPerMonth.kwh * price).toLocaleString("nb-NO", { maximumFractionDigits: 0 })} kr per
                  måned
                </span>
              </div>
            </section>

            {/* Faner */}
            <div className="flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card/60 border-border hover:bg-accent"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "oversikt" && <Oversikt stats={stats} />}
            {tab === "trender" && <Trender stats={stats} />}
            {tab === "monster" && <Monster stats={stats} />}
            {tab === "turer" && (
              <Turer trips={filtered} total={trips.length} q={q} setQ={setQ} onDelete={removeTrip} />
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

/* ---------------------------------- deler --------------------------------- */

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3">
      <Car className="w-10 h-10 mx-auto text-primary" />
      <h2 className="text-xl font-semibold">Ingen kjørelogg ennå</h2>
      <p className="text-sm text-muted-foreground max-w-lg mx-auto">
        Last ned turhistorikken som CSV fra bilens app og importer den her. Filen kan inneholde startdato og
        -tid, sluttdato og -tid, start- og sluttposisjon, varighet, distanse, snittfart, regenerert energi og
        effektivitet. Duplikater hoppes over, så du kan trygt importere nye eksporter fortløpende.
      </p>
      <Button onClick={onPick}>
        <Upload className="w-4 h-4 mr-2" /> Velg CSV-fil
      </Button>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Car;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5 text-primary" />
        {label}
      </div>
      <div className="text-xl font-semibold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function AvgCard({
  title,
  data,
}: {
  title: string;
  data: { km: number; trips: number; minutes: number; kwh: number; projectedKm: number };
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="text-2xl font-bold mt-1">{fmtKm(data.km)}</div>
      <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <dt>Turer</dt>
          <dd className="text-foreground">{data.trips.toFixed(1)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Kjøretid</dt>
          <dd className="text-foreground">{fmtHm(data.minutes)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Forbruk</dt>
          <dd className="text-foreground">{fmtKwh(data.kwh)}</dd>
        </div>
        <div className="flex justify-between border-t border-border/60 pt-1 mt-1">
          <dt>Estimert årlig</dt>
          <dd className="text-foreground font-medium">{fmtKm(data.projectedKm)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/60 backdrop-blur p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}


const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

function Oversikt({ stats }: { stats: ReturnType<typeof computeStats> }) {
  const last30 = stats.perDay.slice(-30);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Kilometer siste 30 kjøredager">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={last30}>
            <defs>
              <linearGradient id="kmFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={10} />
            <YAxis stroke={AXIS} fontSize={10} />
            <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)} km`} />
            <Area type="monotone" dataKey="km" stroke="hsl(var(--primary))" fill="url(#kmFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Rekorder og høydepunkter">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Record icon={Trophy} title="Lengste tur" trip={stats.longest} valueFn={(t) => fmtKm(t.distance_km)} />
          <Record
            icon={Gauge}
            title="Høyeste snittfart"
            trip={stats.fastest}
            valueFn={(t) => `${(t.avg_speed_kmh ?? 0).toFixed(0)} km/t`}
          />
          <Record
            icon={Leaf}
            title="Mest effektive tur"
            trip={stats.mostEfficient}
            valueFn={(t) => `${(t.efficiency_kwh_100km ?? 0).toFixed(1)} kWh/100 km`}
          />
          <Record
            icon={Zap}
            title="Minst effektive tur"
            trip={stats.leastEfficient}
            valueFn={(t) => `${(t.efficiency_kwh_100km ?? 0).toFixed(1)} kWh/100 km`}
          />
          {stats.busiestDay && (
            <div className="sm:col-span-2 rounded-lg border border-border bg-background/50 p-3">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-primary" /> Travleste dag
              </div>
              <div className="font-semibold">
                {stats.busiestDay.label} · {fmtKm(stats.busiestDay.km)} på {stats.busiestDay.trips} turer
              </div>
            </div>
          )}
        </div>
      </Panel>

      <PlacesPanel stats={stats} />

      <EfficiencyChart stats={stats} />

    </div>
  );
}

function PlacesPanel({ stats }: { stats: TripStats }) {
  const [expanded, setExpanded] = useState(false);
  const list = expanded ? stats.allPlaces : stats.topPlaces;
  const rest = stats.allPlaces.length - stats.topPlaces.length;

  return (
      <Panel title="Mest besøkte destinasjoner">
        <ul className={`space-y-2 ${expanded ? "max-h-[360px] overflow-y-auto pr-1" : ""}`}>
          {list.map((p) => (
            <li key={p.place} className="flex items-center gap-3 text-sm">
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="flex-1 truncate">{p.place}</span>
              <span className="text-muted-foreground text-xs">{fmtKm(p.km)}</span>
              <span className="text-xs font-semibold w-10 text-right">{p.visits}×</span>
            </li>
          ))}
        </ul>
        {rest > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            {expanded ? "Vis kun topp 10" : `Vis alle ${stats.allPlaces.length} steder (+${rest})`}
          </button>
        )}
        <div className="mt-4 h-[320px]">
          <PlacesMap places={list} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Størrelsen på punktene viser antall besøk. Klikk for detaljer.
        </p>
      </Panel>
  );
}

function EfficiencyChart({ stats }: { stats: ReturnType<typeof computeStats> }) {
  const [mode, setMode] = useState<"month" | "year">("month");
  const src = mode === "month" ? stats.perMonth : stats.perYear;
  const data = src.map((m) => ({ ...m, eff: m.km ? (m.kwh / m.km) * 100 : 0 }));
  return (
    <Panel
      title={`Effektivitet per ${mode === "month" ? "måned" : "år"} (kWh/100 km)`}
      action={
        <div className="flex gap-1">
          {(["month", "year"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                mode === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "month" ? "Måned" : "År"}
            </button>
          ))}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ bottom: mode === "month" ? 28 : 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis
            dataKey="label"
            stroke={AXIS}
            fontSize={10}
            interval={0}
            angle={mode === "month" ? -45 : 0}
            textAnchor={mode === "month" ? "end" : "middle"}
            height={mode === "month" ? 60 : 30}
          />
          <YAxis stroke={AXIS} fontSize={10} domain={["auto", "auto"]} />
          <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)} kWh/100 km`} />
          <Line
            type="monotone"
            dataKey="eff"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Viser hele perioden{mode === "month" ? " – alle måneder, også uten turer" : ""}.
      </p>
    </Panel>
  );
}


function Record({
  icon: Icon,
  title,
  trip,
  valueFn,
}: {
  icon: typeof Car;
  title: string;
  trip: CarTrip | null;
  valueFn: (t: CarTrip) => string;
}) {
  if (!trip) return null;
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-primary" /> {title}
      </div>
      <div className="font-semibold">{valueFn(trip)}</div>
      <div className="text-[11px] text-muted-foreground truncate">
        {new Date(trip.start_ts).toLocaleDateString("nb-NO")} · {trip.end_place ?? "ukjent sted"}
      </div>
    </div>
  );
}

function Trender({ stats }: { stats: ReturnType<typeof computeStats> }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <PeriodChart title="Kilometer per uke" data={stats.perWeek} />
      <PeriodChart title="Kilometer per måned" data={stats.perMonth} />
      <Panel title="Forbruk vs. regenerert per måned (kWh)">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stats.perMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={10} />
            <YAxis stroke={AXIS} fontSize={10} />
            <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)} kWh`} />
            <Bar dataKey="kwh" name="Forbruk" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="regen" name="Regenerert" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title="Antall turer per uke">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stats.perWeek}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={10} />
            <YAxis stroke={AXIS} fontSize={10} allowDecimals={false} />
            <RTooltip contentStyle={tooltipStyle} />
            <Bar dataKey="trips" name="Turer" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function PeriodChart({ title, data }: { title: string; data: Bucket[] }) {
  return (
    <Panel title={title}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="label" stroke={AXIS} fontSize={10} />
          <YAxis stroke={AXIS} fontSize={10} />
          <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)} km`} />
          <Bar dataKey="km" name="km" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

function Monster({ stats }: { stats: ReturnType<typeof computeStats> }) {
  const maxWd = Math.max(1, ...stats.byWeekday.map((w) => w.km));
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Kilometer per ukedag">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stats.byWeekday}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={10} />
            <YAxis stroke={AXIS} fontSize={10} />
            <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)} km`} />
            <Bar dataKey="km" radius={[4, 4, 0, 0]}>
              {stats.byWeekday.map((w) => (
                <Cell
                  key={w.label}
                  fill="hsl(var(--primary))"
                  fillOpacity={0.35 + 0.65 * (w.km / maxWd)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Når på døgnet starter turene">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stats.byHour}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="hour" stroke={AXIS} fontSize={10} interval={1} />
            <YAxis stroke={AXIS} fontSize={10} allowDecimals={false} />
            <RTooltip contentStyle={tooltipStyle} labelFormatter={(l) => `Kl. ${l}:00`} />
            <Bar dataKey="trips" name="Turer" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Fordeling ukedag">
        <ul className="space-y-2 text-sm">
          {stats.byWeekday.map((w) => (
            <li key={w.label} className="flex items-center gap-3">
              <span className="w-20 text-muted-foreground text-xs">{w.label}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(w.km / maxWd) * 100}%` }}
                />
              </div>
              <span className="text-xs w-24 text-right">
                {fmtKm(w.km)} · {w.trips}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Kjøretid per måned">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stats.perMonth.map((m) => ({ ...m, hours: m.minutes / 60 }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={10} />
            <YAxis stroke={AXIS} fontSize={10} />
            <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)} timer`} />
            <Bar dataKey="hours" name="Timer" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function Turer({
  trips,
  total,
  q,
  setQ,
  onDelete,
}: {
  trips: CarTrip[];
  total: number;
  q: string;
  setQ: (v: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/60 backdrop-blur p-4">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Søk etter sted eller dato …"
          className="max-w-sm"
        />
        <span className="text-xs text-muted-foreground">
          Viser {trips.length} av {total} turer
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2 pr-3">Tidspunkt</th>
              <th className="text-left py-2 pr-3">Fra → til</th>
              <th className="text-right py-2 pr-3">Distanse</th>
              <th className="text-right py-2 pr-3">Varighet</th>
              <th className="text-right py-2 pr-3">Snitt</th>
              <th className="text-right py-2 pr-3">kWh/100</th>
              <th className="text-right py-2 pr-3">Regen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => {
              const d = new Date(t.start_ts);
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-accent/40">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <div>{d.toLocaleDateString("nb-NO")}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>
                  <td className="py-2 pr-3 max-w-[320px]">
                    <div className="truncate">{t.start_place ?? "—"}</div>
                    <div className="truncate text-[11px] text-muted-foreground">→ {t.end_place ?? "—"}</div>
                  </td>
                  <td className="py-2 pr-3 text-right">{t.distance_km.toFixed(1)}</td>
                  <td className="py-2 pr-3 text-right">{t.duration_min != null ? fmtHm(t.duration_min) : "—"}</td>
                  <td className="py-2 pr-3 text-right">{t.avg_speed_kmh?.toFixed(0) ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">{t.efficiency_kwh_100km?.toFixed(1) ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">{t.energy_regen_kwh?.toFixed(2) ?? "—"}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => onDelete(t.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Slett tur"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

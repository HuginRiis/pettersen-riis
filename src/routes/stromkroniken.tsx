import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
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
  Home as HomeIcon,
  Activity,
  Sun,
  Radio,
  Info,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import {
  getTibberFullData,
  type TibberFullResult,
  type TibberHomeFull,
  type PricePoint,
  type ConsumptionPoint,
} from "@/server/tibber";
import { useTibberLive, type TibberLiveHomeState } from "@/hooks/useTibberLive";
import stromImg from "@/assets/stromkroniken.jpg";

export const Route = createFileRoute("/stromkroniken")({
  head: () => ({
    meta: [
      { title: "Strømkrøniken — House Pettersen Riis" },
      {
        name: "description",
        content:
          "Husets krønike om strømgullet — sanntidspris, forbruk og kostnader for borgen og hytta, hentet direkte fra Tibber.",
      },
      { property: "og:title", content: "Strømkrøniken — House Pettersen Riis" },
      {
        property: "og:description",
        content:
          "Sanntidspris, forbruk og strømkostnader for borgen og hytta — direkte fra Tibber.",
      },
      { property: "og:image", content: stromImg },
      { property: "twitter:image", content: stromImg },
    ],
  }),
  component: StromkronikenPage,
});

function StromkronikenPage() {
  const fetchFull = useServerFn(getTibberFullData);
  const [state, setState] = useState<TibberFullResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const live = useTibberLive();

  const load = async () => {
    try {
      const res = await fetchFull();
      setState(res);
      setUpdated(new Date());
    } catch (err) {
      console.error("[Stromkroniken] failed", err);
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
        subtitle="Krøniken om strømmen som rir gjennom borgens årer — sanntidspris, forbruk og kostnader for begge husene, hentet direkte fra Tibber."
        image={stromImg}
      />

      <section className="container mx-auto px-4 py-10 max-w-6xl space-y-10">
        {/* Live Pulse-banner — viser uavhengig av om historikk-API svarer */}
        {!live.loading && live.session?.ok && (
          <LivePulseBanner live={live} />
        )}

        {/* Forklaring når det ikke finnes Tibber-abonnement (priser/historikk = null) */}
        {state && !state.ok && (
          <article className="panel rounded-lg p-5 border-border/60 bg-background/40">
            <div className="flex gap-3">
              <Info size={18} className="text-primary mt-0.5 shrink-0" />
              <div className="text-sm text-foreground/85 space-y-1.5">
                <p className="text-primary font-medium">Uten Tibber-strømabonnement</p>
                <p className="text-foreground/75">
                  Tibber leverer kun <em>sanntidsmåling fra Pulse</em> til denne kontoen
                  (effekt nå + akkumulert kWh i dag). Spotpriser, kostnader og historisk
                  forbruk krever aktivt Tibber-strømabonnement.
                </p>
                {state.error && (
                  <p className="text-[11px] text-muted-foreground/80 italic">
                    Detalj: {state.error}
                  </p>
                )}
              </div>
            </div>
          </article>
        )}

        {loading && !state && !live.session && (
          <div className="text-center text-muted-foreground py-20">
            <div className="inline-flex items-center gap-2 text-sm">
              <RefreshCw size={14} className="animate-spin" /> Spør ravnen om Tibber-tall…
            </div>
          </div>
        )}

        {(state || live.session) && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-muted-foreground">
                Tibber-data — oppdatert{" "}
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
              data={state?.tollnes ?? null}
              live={live.homes.tollnes}
            />
            <HomeBlock
              title="Hytta · Øvre Bjerkesetvegen 222"
              eyebrow="Vinterboligen"
              data={state?.hytta ?? null}
              live={live.homes.hytta}
            />

            {state?.ok && <ComparisonBlock tollnes={state.tollnes} hytta={state.hytta} />}

            {state && state.homesDebug.length > 0 && (
              <p className="text-[10px] text-muted-foreground/60 italic">
                Tibber-hjem oppdaget: {state.homesDebug.join(" · ")}
              </p>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}

// ============================================================
// Home block — alle Tibber-tall for ett hjem
// ============================================================

function HomeBlock({
  title,
  eyebrow,
  data,
  live,
}: {
  title: string;
  eyebrow: string;
  data: TibberHomeFull | null;
  live: TibberLiveHomeState;
}) {
  // Hvis vi verken har historikk-data eller live-data → ingenting å vise
  if ((!data || !data.found) && live.status === "idle") {
    return (
      <article className="panel rounded-lg p-6">
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          {eyebrow}
        </div>
        <h2 className="text-2xl text-primary mt-1 mb-3 flex items-center gap-2">
          <Crown size={20} /> {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {data?.error ?? "Fant ingen treff hos Tibber for denne adressen."}
        </p>
      </article>
    );
  }

  const reading = live.reading;
  const livePower = reading?.power ?? null;
  const liveKwhToday = reading?.accumulatedConsumption ?? null;
  const liveMin = reading?.minPower ?? null;
  const liveMax = reading?.maxPower ?? null;

  // Fall-back til historikk-data om live ikke er tilgjengelig ennå
  const fallbackWatt = data?.latestHourKwh != null ? Math.round(data.latestHourKwh * 1000) : null;
  const watt = livePower != null ? Math.round(livePower) : fallbackWatt;
  const wattSub =
    live.status === "live"
      ? "live · oppdateres hvert 2. sek"
      : live.status === "stale"
        ? "venter på Pulse…"
        : live.status === "connecting"
          ? "kobler til…"
          : data?.latestHourFrom
            ? `snitt fra ${formatHour(data.latestHourFrom)}`
            : "—";

  const todayKwh = liveKwhToday != null ? liveKwhToday : data?.todayKwh ?? 0;
  const priceNow = data?.priceNow?.total ?? null;
  const hasSubscription = (data?.pricesToday.length ?? 0) > 0;

  return (
    <article className="panel rounded-lg p-5 sm:p-7 space-y-7">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            {eyebrow}
          </div>
          <h2 className="text-2xl text-primary mt-1 flex items-center gap-2">
            <Crown size={20} /> {title}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <HomeIcon size={11} />
            {data?.address?.address1 ?? data?.nickname ?? "—"}
            {data?.address?.postalCode && ` · ${data.address.postalCode} ${data.address.city ?? ""}`}
            {data?.size != null && ` · ${data.size} m²`}
            {data?.numberOfResidents != null && ` · ${data.numberOfResidents} pers.`}
            {data?.mainFuseSize != null && ` · ${data.mainFuseSize}A hovedsikring`}
          </p>
          {(live.status === "live" || live.status === "stale") && (
            <p className={`text-[10px] mt-1 flex items-center gap-1 ${live.status === "live" ? "text-[oklch(0.72_0.16_150)]" : "text-muted-foreground"}`}>
              <Radio size={10} className={live.status === "live" ? "animate-pulse" : ""} />
              Pulse {live.status === "live" ? "live · sanntid" : "stille — venter på data"}
            </p>
          )}
        </div>
      </div>

      {/* Heltall — nøkkeltall */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat
          icon={Bolt}
          label="Effekt nå"
          value={watt != null ? `${formatWatt(watt)}` : "—"}
          sub={wattSub}
          tone="primary"
        />
        <BigStat
          icon={Zap}
          label="kWh i dag"
          value={todayKwh > 0 ? todayKwh.toFixed(2) : "—"}
          sub={
            reading?.accumulatedCost != null
              ? `≈ ${reading.accumulatedCost.toFixed(0)} kr så langt`
              : data?.todayCost != null
                ? `≈ ${data.todayCost.toFixed(0)} kr så langt`
                : live.status === "live"
                  ? "akkumulert siden midnatt"
                  : "—"
          }
          tone="primary"
        />
        <BigStat
          icon={TrendingDown}
          label="Min/maks i dag"
          value={
            liveMin != null && liveMax != null
              ? `${formatWatt(liveMin)} / ${formatWatt(liveMax)}`
              : "—"
          }
          sub="laveste / høyeste effekt siden midnatt"
          tone="gold"
        />
        <BigStat
          icon={Coins}
          label="Pris nå"
          value={priceNow != null ? `${priceNow.toFixed(3)} kr` : "—"}
          sub={
            hasSubscription
              ? `per kWh · ${data?.priceNow?.level?.toLowerCase().replace("_", " ") ?? "—"}`
              : "krever Tibber-abo"
          }
          tone="gold"
        />
      </div>

      {/* Mer-tall — vises kun om vi har historikk fra abo */}
      {hasSubscription && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SmallStat
          label="Måned hittil"
          value={(data?.thisMonthKwh ?? 0) > 0 ? `${data!.thisMonthKwh.toFixed(0)} kWh` : "—"}
          sub={data?.thisMonthCost != null ? `${data.thisMonthCost.toFixed(0)} kr` : ""}
        />
        <SmallStat
          label="I går"
          value={(data?.yesterdayKwh ?? 0) > 0 ? `${data!.yesterdayKwh.toFixed(1)} kWh` : "—"}
          sub={data?.yesterdayCost != null ? `${data.yesterdayCost.toFixed(0)} kr` : ""}
        />
        <SmallStat
          label="Forrige måned"
          value={(data?.lastMonthKwh ?? 0) > 0 ? `${data!.lastMonthKwh.toFixed(0)} kWh` : "—"}
          sub={data?.lastMonthCost != null ? `${data.lastMonthCost.toFixed(0)} kr` : ""}
        />
        <SmallStat
          label="I år"
          value={(data?.thisYearKwh ?? 0) > 0 ? `${data!.thisYearKwh.toFixed(0)} kWh` : "—"}
          sub={data?.thisYearCost != null ? `${data.thisYearCost.toFixed(0)} kr` : ""}
        />
      </div>
      )}

      {/* Pris-graf i dag (+ i morgen om publisert) */}
      {data && data.pricesToday.length > 0 && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <Sun size={14} /> Spotpris time-for-time
          </h3>
          <PriceChart today={data.pricesToday} tomorrow={data.pricesTomorrow} priceNow={priceNow} />
        </div>
      )}

      {/* Forbruk siste 48 timer */}
      {data && data.hourly.length > 0 && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <Clock size={14} /> Forbruk siste 48 timer
          </h3>
          <HourlyChart hourly={data.hourly} />
        </div>
      )}

      {/* Daglig forbruk (60 dager) */}
      {data && data.daily.length > 0 && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <Calendar size={14} /> Daglig forbruk · siste {data.daily.length} dager
          </h3>
          <DailyChart daily={data.daily} />
        </div>
      )}

      {/* Kumulativ kWh denne måneden vs forrige måned */}
      {data && data.daily.length > 0 && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <TrendingUp size={14} /> Måneden mot forrige
          </h3>
          <MonthVsLastChart daily={data.daily} />
        </div>
      )}

      {/* Månedlig forbruk siste 13 mnd */}
      {data && data.monthly.length > 0 && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <Calendar size={14} /> Måned for måned · siste 13
          </h3>
          <MonthlyChart monthly={data.monthly} />
        </div>
      )}

      {/* Årlig forbruk */}
      {data && data.yearly.length > 0 && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <Sparkles size={14} /> Årets krønike
          </h3>
          <YearlyTable yearly={data.yearly} />
        </div>
      )}

      {/* Måneds-prognose — kun med abo */}
      {hasSubscription && data && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <Sparkles size={14} /> Månedens spådom
          </h3>
          <MonthForecast data={data} />
        </div>
      )}
    </article>
  );
}

// ============================================================
// Små UI-blokker
// ============================================================

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
      <div className="text-[10px] text-muted-foreground mt-1 capitalize">{sub}</div>
    </div>
  );
}

function SmallStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md p-3 bg-background/30 border border-border/40">
      <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-foreground mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/80">{sub}</div>}
    </div>
  );
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
}

function priceLevelColor(total: number, min: number, max: number): string {
  if (max === min) return "oklch(0.78 0.13 85)";
  const pct = (total - min) / (max - min);
  if (pct < 0.33) return "oklch(0.72 0.16 150)";
  if (pct < 0.66) return "oklch(0.78 0.13 85)";
  return "oklch(0.65 0.22 25)";
}

// ============================================================
// Pris-graf
// ============================================================

function PriceChart({
  today,
  tomorrow,
  priceNow,
}: {
  today: PricePoint[];
  tomorrow: PricePoint[];
  priceNow: number | null;
}) {
  const all = [...today, ...tomorrow];
  const min = Math.min(...all.map((p) => p.total));
  const max = Math.max(...all.map((p) => p.total));

  const data = all.map((p) => {
    const d = new Date(p.startsAt);
    const isTomorrow = tomorrow.includes(p);
    return {
      label: `${isTomorrow ? "i.m. " : ""}${d.getHours().toString().padStart(2, "0")}`,
      total: Math.round(p.total * 1000) / 1000,
      isTomorrow,
      raw: p,
    };
  });

  return (
    <div className="rounded-xl bg-[oklch(0.18_0.02_270)] p-4 border border-border/40">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="oklch(0.3 0.02 270)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 10 }}
              width={48}
              unit=" kr"
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.22 0.02 270)",
                border: "1px solid oklch(0.35 0.02 270)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v: unknown) =>
                typeof v === "number" ? [`${v.toFixed(3)} kr/kWh`, "Pris"] : ["—", ""]
              }
            />
            <Bar dataKey="total" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={priceLevelColor(d.total, min, max)}
                  fillOpacity={d.isTomorrow ? 0.55 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 flex-wrap gap-2">
        <span>
          Min: <span className="text-[oklch(0.72_0.16_150)] tabular-nums">{min.toFixed(3)} kr</span> ·
          Maks: <span className="text-[oklch(0.65_0.22_25)] tabular-nums ml-1">{max.toFixed(3)} kr</span>
        </span>
        {priceNow != null && (
          <span>
            Nå: <span className="text-primary tabular-nums">{priceNow.toFixed(3)} kr</span>
          </span>
        )}
        {tomorrow.length > 0 && (
          <span className="italic">— blassere søyler = i morgen</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Time-for-time-graf siste 48t
// ============================================================

function HourlyChart({ hourly }: { hourly: ConsumptionPoint[] }) {
  const data = hourly.map((h) => {
    const d = new Date(h.from);
    return {
      label: `${d.getHours().toString().padStart(2, "0")}`,
      kwh: h.kwh ?? 0,
      cost: h.cost ?? 0,
    };
  });

  return (
    <div className="rounded-xl bg-[oklch(0.18_0.02_270)] p-4 border border-border/40">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="oklch(0.3 0.02 270)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 10 }}
              width={42}
              unit=" kWh"
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.22 0.02 270)",
                border: "1px solid oklch(0.35 0.02 270)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v: unknown, name: unknown) =>
                typeof v === "number"
                  ? [
                      name === "kwh" ? `${v.toFixed(2)} kWh` : `${v.toFixed(2)} kr`,
                      name === "kwh" ? "Forbruk" : "Kostnad",
                    ]
                  : ["—", String(name)]
              }
            />
            <Bar dataKey="kwh" fill="oklch(0.62 0.22 290)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================
// Daglig forbruk
// ============================================================

function DailyChart({ daily }: { daily: ConsumptionPoint[] }) {
  const data = daily.map((d) => {
    const date = new Date(d.from);
    return {
      label: `${date.getDate()}.${date.getMonth() + 1}`,
      kwh: d.kwh ?? 0,
      cost: d.cost ?? 0,
    };
  });

  return (
    <div className="rounded-xl bg-[oklch(0.18_0.02_270)] p-4 border border-border/40">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="oklch(0.3 0.02 270)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 10 }}
              width={42}
              unit=" kWh"
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.22 0.02 270)",
                border: "1px solid oklch(0.35 0.02 270)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v: unknown, name: unknown) =>
                typeof v === "number"
                  ? [
                      name === "kwh" ? `${v.toFixed(1)} kWh` : `${v.toFixed(0)} kr`,
                      name === "kwh" ? "Forbruk" : "Kostnad",
                    ]
                  : ["—", String(name)]
              }
            />
            <Bar dataKey="kwh" fill="oklch(0.62 0.22 290)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================
// Måned vs forrige måned (kumulativt fra daglig)
// ============================================================

function MonthVsLastChart({ daily }: { daily: ConsumptionPoint[] }) {
  const now = new Date();
  const thisMonthKey = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7);
  const lastD = new Date();
  lastD.setMonth(lastD.getMonth() - 1);
  const lastMonthKey = lastD.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7);

  const thisDays = daily.filter(
    (d) =>
      new Date(d.from).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7) ===
      thisMonthKey,
  );
  const lastDays = daily.filter(
    (d) =>
      new Date(d.from).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7) ===
      lastMonthKey,
  );

  const daysInThis = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysInLast = new Date(lastD.getFullYear(), lastD.getMonth() + 1, 0).getDate();
  const maxDays = Math.max(daysInThis, daysInLast);

  let cumThis = 0;
  let cumLast = 0;
  const thisByDay = new Map<number, number>();
  const lastByDay = new Map<number, number>();
  for (const d of thisDays) {
    const day = new Date(d.from).getDate();
    thisByDay.set(day, (d.kwh ?? 0));
  }
  for (const d of lastDays) {
    const day = new Date(d.from).getDate();
    lastByDay.set(day, (d.kwh ?? 0));
  }

  const data: Array<{ day: number; "Denne måned": number | null; "Forrige måned": number | null }> = [];
  for (let i = 1; i <= maxDays; i++) {
    let thisVal: number | null = null;
    let lastVal: number | null = null;
    if (thisByDay.has(i)) {
      cumThis += thisByDay.get(i)!;
      thisVal = Math.round(cumThis * 10) / 10;
    } else if (i <= now.getDate()) {
      thisVal = Math.round(cumThis * 10) / 10;
    }
    if (lastByDay.has(i)) {
      cumLast += lastByDay.get(i)!;
      lastVal = Math.round(cumLast * 10) / 10;
    } else if (i <= daysInLast) {
      lastVal = Math.round(cumLast * 10) / 10;
    }
    data.push({ day: i, "Denne måned": thisVal, "Forrige måned": lastVal });
  }

  const thisTotal = cumThis;
  const lastSameDay = lastByDay.get(0) ?? 0;
  let lastUntilToday = 0;
  for (let i = 1; i <= now.getDate(); i++) lastUntilToday += lastByDay.get(i) ?? 0;
  const delta = thisTotal - lastUntilToday;
  const deltaPct = lastUntilToday > 0 ? (delta / lastUntilToday) * 100 : null;

  void lastSameDay;

  return (
    <div className="rounded-xl bg-[oklch(0.18_0.02_270)] p-4 border border-border/40 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-foreground/85">
            <span className="inline-block w-3 h-3 rounded-sm bg-[oklch(0.62_0.22_290)]" />
            Denne måned: <span className="tabular-nums">{thisTotal.toFixed(0)} kWh</span>
          </span>
          <span className="flex items-center gap-1.5 text-foreground/65">
            <span className="inline-block w-3 h-3 rounded-sm bg-[oklch(0.65_0.04_250)]" />
            Forrige: <span className="tabular-nums">{cumLast.toFixed(0)} kWh</span>
          </span>
        </div>
        {deltaPct != null && (
          <span
            className={`tabular-nums font-medium ${
              delta < 0 ? "text-[oklch(0.72_0.16_150)]" : "text-[oklch(0.7_0.18_25)]"
            }`}
          >
            {delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(0)} kWh ({deltaPct >= 0 ? "+" : ""}
            {deltaPct.toFixed(0)}%) mot samme dag forrige måned
          </span>
        )}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="kwhThisM" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.62 0.22 290)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="oklch(0.62 0.22 290)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="kwhLastM" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.65 0.04 250)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="oklch(0.65 0.04 250)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.3 0.02 270)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 11 }}
              ticks={[1, 5, 9, 13, 17, 21, 25, 29]}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 11 }}
              width={40}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.22 0.02 270)",
                border: "1px solid oklch(0.35 0.02 270)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v: unknown, name: unknown) =>
                typeof v === "number" ? [`${v.toFixed(0)} kWh`, String(name)] : ["—", String(name)]
              }
              labelFormatter={(d: number) => `Dag ${d}`}
            />
            <Area
              type="monotone"
              dataKey="Forrige måned"
              stroke="oklch(0.65 0.04 250)"
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="url(#kwhLastM)"
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="Denne måned"
              stroke="oklch(0.62 0.22 290)"
              strokeWidth={2.5}
              fill="url(#kwhThisM)"
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================
// Måned for måned · siste 13
// ============================================================

function MonthlyChart({ monthly }: { monthly: ConsumptionPoint[] }) {
  const data = monthly.map((m) => {
    const d = new Date(m.from);
    return {
      label: d.toLocaleDateString("nb-NO", {
        month: "short",
        year: "2-digit",
        timeZone: "Europe/Oslo",
      }),
      kwh: m.kwh ?? 0,
      cost: m.cost ?? 0,
    };
  });

  return (
    <div className="rounded-xl bg-[oklch(0.18_0.02_270)] p-4 border border-border/40">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="oklch(0.3 0.02 270)" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 10 }} />
            <YAxis
              yAxisId="kwh"
              tick={{ fill: "oklch(0.65 0.02 270)", fontSize: 10 }}
              width={42}
              unit=" kWh"
            />
            <YAxis
              yAxisId="kr"
              orientation="right"
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
              width={42}
              unit=" kr"
            />
            <Tooltip
              contentStyle={{
                background: "oklch(0.22 0.02 270)",
                border: "1px solid oklch(0.35 0.02 270)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v: unknown, name: unknown) =>
                typeof v === "number"
                  ? [
                      name === "kwh" ? `${v.toFixed(0)} kWh` : `${v.toFixed(0)} kr`,
                      name === "kwh" ? "Forbruk" : "Kostnad",
                    ]
                  : ["—", String(name)]
              }
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              yAxisId="kwh"
              type="monotone"
              dataKey="kwh"
              name="Forbruk"
              stroke="oklch(0.62 0.22 290)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="kr"
              type="monotone"
              dataKey="cost"
              name="Kostnad"
              stroke="oklch(0.78 0.13 85)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================
// Årsoversikt — tabell
// ============================================================

function YearlyTable({ yearly }: { yearly: ConsumptionPoint[] }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-[oklch(0.18_0.02_270)] border border-border/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">
              År
            </th>
            <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-primary font-normal">
              Forbruk
            </th>
            <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-[oklch(0.78_0.13_85)] font-normal">
              Kostnad
            </th>
            <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">
              Snitt
            </th>
          </tr>
        </thead>
        <tbody>
          {yearly.map((y) => {
            const year = new Date(y.from).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 4);
            const avg = y.kwh && y.cost ? y.cost / y.kwh : null;
            return (
              <tr key={y.from} className="border-b border-border/20 last:border-0">
                <td className="px-3 py-2 text-foreground/85">{year}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {y.kwh != null ? `${y.kwh.toFixed(0)} kWh` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {y.cost != null ? `${y.cost.toFixed(0)} kr` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {avg != null ? `${avg.toFixed(2)} kr/kWh` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Måneds-prognose
// ============================================================

function MonthForecast({ data }: { data: TibberHomeFull }) {
  const energyMonth = data.thisMonthKwh;
  const costMonth = data.thisMonthCost;

  if (energyMonth <= 0 && (costMonth == null || costMonth <= 0)) {
    return <p className="text-xs text-muted-foreground">Ingen månedsdata tilgjengelig.</p>;
  }

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const fraction = dayOfMonth / daysInMonth;

  const projectedEnergy = energyMonth > 0 ? energyMonth / fraction : null;
  const projectedCost = costMonth != null && costMonth > 0 ? costMonth / fraction : null;
  const remainingCost =
    projectedCost != null && costMonth != null ? projectedCost - costMonth : null;

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
          Per nå: {energyMonth.toFixed(0)} kWh · {pctOfMonth}% av måneden gått
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
          Per nå: {costMonth?.toFixed(0) ?? "—"} kr · gjenstår ~
          {remainingCost?.toFixed(0) ?? "—"} kr
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sammenligning
// ============================================================

function ComparisonBlock({
  tollnes,
  hytta,
}: {
  tollnes: TibberHomeFull;
  hytta: TibberHomeFull;
}) {
  if (!tollnes.found && !hytta.found) return null;

  const rows: Array<{ label: string; b?: number | null; h?: number | null; unit: string; precision: number }> = [
    { label: "Pris nå", b: tollnes.priceNow?.total ?? null, h: hytta.priceNow?.total ?? null, unit: "kr/kWh", precision: 3 },
    { label: "Snittpris i dag", b: tollnes.priceAvgToday, h: hytta.priceAvgToday, unit: "kr/kWh", precision: 3 },
    { label: "kWh i dag", b: tollnes.todayKwh, h: hytta.todayKwh, unit: "kWh", precision: 1 },
    { label: "Kostnad i dag", b: tollnes.todayCost, h: hytta.todayCost, unit: "kr", precision: 0 },
    { label: "kWh i går", b: tollnes.yesterdayKwh, h: hytta.yesterdayKwh, unit: "kWh", precision: 1 },
    { label: "Kostnad i går", b: tollnes.yesterdayCost, h: hytta.yesterdayCost, unit: "kr", precision: 0 },
    { label: "kWh denne måneden", b: tollnes.thisMonthKwh, h: hytta.thisMonthKwh, unit: "kWh", precision: 0 },
    { label: "Kostnad denne måneden", b: tollnes.thisMonthCost, h: hytta.thisMonthCost, unit: "kr", precision: 0 },
    { label: "kWh forrige måned", b: tollnes.lastMonthKwh, h: hytta.lastMonthKwh, unit: "kWh", precision: 0 },
    { label: "Kostnad forrige måned", b: tollnes.lastMonthCost, h: hytta.lastMonthCost, unit: "kr", precision: 0 },
    { label: "kWh i år", b: tollnes.thisYearKwh, h: hytta.thisYearKwh, unit: "kWh", precision: 0 },
    { label: "Kostnad i år", b: tollnes.thisYearCost, h: hytta.thisYearCost, unit: "kr", precision: 0 },
  ];

  const chartData = rows
    .filter((r) => r.unit === "kr" && ((r.b ?? 0) > 0 || (r.h ?? 0) > 0))
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
              <Legend wrapperStyle={{ fontSize: 11 }} />
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
              const isPrice = r.unit === "kr/kWh";
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
                    {isPrice ? "—" : sum > 0 ? `${sum.toFixed(r.precision)} ${r.unit}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-4 italic">
        — Husets samlede regnskap, hentet direkte fra Tibber.
      </p>
    </article>
  );
}

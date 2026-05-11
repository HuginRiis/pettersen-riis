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
  getStoredDailyKwh,
  type TibberFullResult,
  type TibberHomeFull,
  type PricePoint,
  type ConsumptionPoint,
  type StoredDailyKwh,
} from "@/server/tibber";

import { getSpotPrices, type SpotPriceResult } from "@/server/spot-price";
import { getPowerByTheHour, type PbthResult, type PbthHomeData } from "@/server/power-by-the-hour";
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

/**
 * Slå sammen aggregater fra Power-by-the-Hour (Homey) inn i TibberHomeFull.
 * Beholder live/today fra Tibber, men overstyrer i går / måned / forrige måned / år
 * med Pbth-tall, fordi Tibber-historikken på disse kontoene ikke stemmer.
 */
function mergePbthIntoTibber(
  base: TibberHomeFull,
  pbth: PbthHomeData | null,
): TibberHomeFull {
  if (!pbth || !pbth.found) return base;
  const h = pbth.highlights;
  const pick = <T,>(p: T | undefined, fallback: T): T =>
    p !== undefined && p !== null ? p : fallback;
  return {
    ...base,
    yesterdayKwh: pick(h.energyYesterday, base.yesterdayKwh),
    yesterdayCost: pick(h.costYesterday ?? null, base.yesterdayCost),
    thisMonthKwh: pick(h.energyThisMonth, base.thisMonthKwh),
    thisMonthCost: pick(h.costThisMonth ?? null, base.thisMonthCost),
    lastMonthKwh: pick(h.energyLastMonth, base.lastMonthKwh),
    lastMonthCost: pick(h.costLastMonth ?? null, base.lastMonthCost),
    thisYearKwh: pick(h.energyThisYear, base.thisYearKwh),
    thisYearCost: pick(h.costThisYear ?? null, base.thisYearCost),
  };
}

function StromkronikenPage() {
  const fetchFull = useServerFn(getTibberFullData);
  const fetchSpot = useServerFn(getSpotPrices);
  const fetchPbth = useServerFn(getPowerByTheHour);
  const [state, setState] = useState<TibberFullResult | null>(null);
  const [spot, setSpot] = useState<SpotPriceResult | null>(null);
  const [pbth, setPbth] = useState<PbthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const live = useTibberLive();

  const load = async () => {
    try {
      const [res, spotRes, pbthRes] = await Promise.all([fetchFull(), fetchSpot(), fetchPbth()]);
      setState(res);
      setSpot(spotRes);
      setPbth(pbthRes);
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

  // Borgen er i NO2, Hytta er i NO1 (priser inkl. mva fra hvakosterstrommen.no)
  const borgenSpot = spot?.ok ? spot.zones.NO2 ?? null : null;
  const hyttaSpot = spot?.ok ? spot.zones.NO1 ?? null : null;

  // Slå sammen Pbth-aggregater (i går / måned / år) inn over Tibber-data,
  // siden Tibber-historikken ikke er korrekt for disse kontoene.
  const pbthBorgen = pbth?.ok ? pbth.borgen : null;
  const pbthHytta = pbth?.ok ? pbth.hytta : null;
  const tollnesData = state?.tollnes ? mergePbthIntoTibber(state.tollnes, pbthBorgen) : null;
  const hyttaData = state?.hytta ? mergePbthIntoTibber(state.hytta, pbthHytta) : null;

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
              priceMultiplier={1.9}
              title="Borgen · Nordre Lensmannsveg 17"
              eyebrow="Husets sete"
              data={tollnesData}
              live={live.homes.tollnes}
              spotPriceNow={borgenSpot?.priceNow ?? null}
              spotPriceAvg={borgenSpot?.priceAvg ?? null}
            />
            <HomeBlock
              priceMultiplier={1.52}
              title="Hytta · Øvre Bjerkesetvegen 222"
              eyebrow="Vinterboligen"
              data={hyttaData}
              live={live.homes.hytta}
              spotPriceNow={hyttaSpot?.priceNow ?? null}
              spotPriceAvg={hyttaSpot?.priceAvg ?? null}
            />

            {tollnesData && hyttaData && (
              <ComparisonBlock
                tollnes={tollnesData}
                hytta={hyttaData}
                borgenSpotNow={borgenSpot?.priceNow ?? null}
                borgenSpotAvg={borgenSpot?.priceAvg ?? null}
                hyttaSpotNow={hyttaSpot?.priceNow ?? null}
                hyttaSpotAvg={hyttaSpot?.priceAvg ?? null}
              />
            )}

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
  priceMultiplier = 1,
  spotPriceNow = null,
  spotPriceAvg = null,
}: {
  title: string;
  eyebrow: string;
  data: TibberHomeFull | null;
  live: TibberLiveHomeState;
  priceMultiplier?: number;
  spotPriceNow?: number | null;
  spotPriceAvg?: number | null;
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

  // Hent lagret daglig kWh fra DB som fallback når Tibber-abo mangler historikk
  const fetchStored = useServerFn(getStoredDailyKwh);
  const [storedRows, setStoredRows] = useState<StoredDailyKwh[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchStored()
        .then((res) => {
          if (!cancelled && res.rows) setStoredRows(res.rows);
        })
        .catch(() => {});
    };
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [fetchStored]);
  // Bruk timesprisen fra dagens prisliste som matcher klokketimen nå (samme som vises i grafen)
  const currentHourPrice = (() => {
    const list = data?.pricesToday ?? [];
    if (!list.length) return null;
    const now = Date.now();
    const match = list.find((p) => {
      const start = new Date(p.startsAt).getTime();
      return now >= start && now < start + 3_600_000;
    });
    return match?.total ?? null;
  })();
  // Bruk Tibber-pris hvis tilgjengelig, ellers spot-pris (NO1/NO2 inkl. mva).
  // Begge ganges med multiplier for å vise total kostnad inkl. nettleie/avgifter.
  const basePrice = currentHourPrice ?? spotPriceNow;
  const priceNow = basePrice != null ? basePrice * priceMultiplier : null;
  const hasSubscription = (data?.pricesToday.length ?? 0) > 0;
  const priceSource: "tibber" | "spot" | null =
    currentHourPrice != null ? "tibber" : spotPriceNow != null ? "spot" : null;

  // ─── Sammenligninger: i går (samme tid) og samme dag forrige måned ───
  const now = new Date();
  const dayFraction = Math.max(
    0.01,
    (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400,
  );

  // Bruk Tibber-data hvis tilgjengelig, ellers fall tilbake til lagrede dagsverdier
  const ownStored = data?.location
    ? storedRows.filter((r) => r.location === data.location)
    : [];
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const storedFor = (d: Date) => ownStored.find((r) => r.day === dayKey(d))?.kwh ?? null;

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayFull =
    data?.yesterdayKwh != null && data.yesterdayKwh > 0
      ? data.yesterdayKwh
      : storedFor(yesterdayDate);
  const yesterdayProrated =
    yesterdayFull != null && yesterdayFull > 0 ? yesterdayFull * dayFraction : null;
  const vsYesterday =
    yesterdayProrated != null && yesterdayProrated > 0 && todayKwh > 0
      ? { diff: todayKwh - yesterdayProrated, pct: ((todayKwh - yesterdayProrated) / yesterdayProrated) * 100 }
      : null;

  // Samme ukedag forrige uke (7 dager tilbake)
  const lastWeekDate = new Date(now);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekKey = dayKey(lastWeekDate);
  const sameDayLastWeek = (() => {
    if (data?.daily?.length) {
      const match = data.daily.find((d) => {
        const dd = new Date(d.from);
        return dayKey(dd) === lastWeekKey;
      });
      if (match?.kwh != null && match.kwh > 0) return match.kwh;
    }
    return storedFor(lastWeekDate);
  })();
  const lastWeekProrated =
    sameDayLastWeek != null && sameDayLastWeek > 0 ? sameDayLastWeek * dayFraction : null;
  const vsLastWeek =
    lastWeekProrated != null && lastWeekProrated > 0 && todayKwh > 0
      ? { diff: todayKwh - lastWeekProrated, pct: ((todayKwh - lastWeekProrated) / lastWeekProrated) * 100 }
      : null;

  // Samme dato forrige måned — Tibber daily først, så lagret dagsverdi
  const lastMonthDate = new Date(now);
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const targetKey = dayKey(lastMonthDate);
  const sameDayLastMonth = (() => {
    if (data?.daily?.length) {
      const match = data.daily.find((d) => {
        const dd = new Date(d.from);
        return dayKey(dd) === targetKey;
      });
      if (match?.kwh != null && match.kwh > 0) return match.kwh;
    }
    return storedFor(lastMonthDate);
  })();
  const lastMonthProrated =
    sameDayLastMonth != null && sameDayLastMonth > 0 ? sameDayLastMonth * dayFraction : null;
  const vsLastMonth =
    lastMonthProrated != null && lastMonthProrated > 0 && todayKwh > 0
      ? { diff: todayKwh - lastMonthProrated, pct: ((todayKwh - lastMonthProrated) / lastMonthProrated) * 100 }
      : null;

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
            priceSource === "tibber"
              ? "per kWh · time nå (Tibber)"
              : priceSource === "spot"
                ? "per kWh · spotpris × påslag"
                : "venter på pris…"
          }
          tone="gold"
        />
      </div>

      {/* Sammenligningsbokser: i går · forrige uke · forrige måned */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <TrendStat
          label="Sammenlignet med i går"
          todayKwh={todayKwh}
          referenceKwh={yesterdayProrated}
          trend={vsYesterday}
          referenceFullDayKwh={data?.yesterdayKwh ?? null}
          referenceLabel="i går"
        />
        <TrendStat
          label="Samme dag forrige uke"
          todayKwh={todayKwh}
          referenceKwh={lastWeekProrated}
          trend={vsLastWeek}
          referenceFullDayKwh={sameDayLastWeek}
          referenceLabel="forrige uke"
        />
        <TrendStat
          label="Samme dag forrige måned"
          todayKwh={todayKwh}
          referenceKwh={lastMonthProrated}
          trend={vsLastMonth}
          referenceFullDayKwh={sameDayLastMonth}
          referenceLabel="forrige måned"
        />
      </div>

      {(live.status === "live" || live.status === "stale") && (
        <PulseHistoryChart location={live.location} reading={live.reading} />
      )}

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

      {/* Akkumulert forbruk + sammenligning mot forrige periode */}
      {data && (
        <AccumulatedBlock data={data} liveTodayKwh={liveKwhToday} />
      )}

      {/* Pris-graf i dag (+ i morgen om publisert) */}
      {data && data.pricesToday.length > 0 && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <Sun size={14} /> Spotpris time-for-time
          </h3>
          <PriceChart today={data.pricesToday} tomorrow={data.pricesTomorrow} priceNow={priceNow} multiplier={priceMultiplier} />
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

      {/* Akkumulert kWh per valgt måned (grønn) + estimat */}
      {data && (data.daily.length > 0 || data.monthly.length > 0) && (
        <div>
          <h3 className="text-sm tracking-[0.3em] uppercase text-primary mb-3 flex items-center gap-2">
            <TrendingUp size={14} /> Akkumulert kWh · valgt måned
          </h3>
          <MonthlyAccumulatedChart daily={data.daily} monthly={data.monthly} />
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

// ============================================================
// Akkumulert forbruk + sammenligning mot forrige periode
// ============================================================
function AccumulatedBlock({
  data,
  liveTodayKwh,
}: {
  data: TibberHomeFull;
  liveTodayKwh: number | null;
}) {
  const fetchStored = useServerFn(getStoredDailyKwh);
  const [stored, setStored] = useState<StoredDailyKwh[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadStored = () => {
      fetchStored()
        .then((res) => {
          if (!cancelled && res.rows) setStored(res.rows);
        })
        .catch(() => {});
    };
    loadStored();
    const timer = window.setInterval(loadStored, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchStored]);

  // Bruk vår lagrede dagstabell som sannhet for måned/år når Tibber mangler abonnement.
  const now = new Date();
  const todayKey = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const monthKey = todayKey.slice(0, 7);
  const yearKey = todayKey.slice(0, 4);
  const ownStored = stored.filter((r) => r.location === data.location);
  const storedToday = ownStored.find((r) => r.day === todayKey)?.kwh ?? 0;
  const storedMonth = ownStored
    .filter((r) => r.day.startsWith(monthKey))
    .reduce((sum, r) => sum + r.kwh, 0);
  const storedYear = ownStored
    .filter((r) => r.day.startsWith(yearKey))
    .reduce((sum, r) => sum + r.kwh, 0);

  const liveOrApiToday = liveTodayKwh != null ? liveTodayKwh : data.todayKwh;
  const todayKwh = Math.max(liveOrApiToday ?? 0, storedToday);
  const todayDelta = Math.max(0, todayKwh - storedToday);
  const thisMonthKwh = Math.max(data.thisMonthKwh ?? 0, storedMonth + todayDelta);
  const thisYearKwh = Math.max(data.thisYearKwh ?? 0, storedYear + todayDelta);
  const yesterdayKwh = data.yesterdayKwh;

  // I dag vs samme tid i går — sammenlign mot i går proporsjonalt med tid på døgnet
  const minutesIntoDay = now.getHours() * 60 + now.getMinutes();
  const dayFraction = minutesIntoDay / (24 * 60);
  const yesterdayProrated = yesterdayKwh * dayFraction;
  const todayVsYesterday = diffPct(todayKwh, yesterdayProrated);

  // Måned hittil vs forrige måned proporsjonalt
  const dayOfMonth = now.getDate();
  const daysInLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const lastMonthProrated = data.lastMonthKwh * (dayOfMonth / daysInLastMonth);
  const monthVsLastMonth = diffPct(thisMonthKwh, lastMonthProrated);

  // I år — vis bare totalsum (ingen direkte fjorår-tall i datasettet)
  const totalAccumulated = thisYearKwh;
  const totalCost = data.thisYearCost;

  return (
    <div className="space-y-3">
      <h3 className="text-sm tracking-[0.3em] uppercase text-primary flex items-center gap-2">
        <Activity size={14} /> Akkumulert energiforbruk
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AccCard
          label="I dag"
          kwh={todayKwh}
          cost={data.todayCost}
          comparison={todayVsYesterday}
          compareLabel="vs samme tid i går"
        />
        <AccCard
          label="Måned hittil"
          kwh={thisMonthKwh}
          cost={data.thisMonthCost}
          comparison={monthVsLastMonth}
          compareLabel="vs samme dag forrige måned"
        />
        <AccCard
          label="I år totalt"
          kwh={totalAccumulated}
          cost={totalCost}
          comparison={null}
          compareLabel="akkumulert hittil i år"
        />
      </div>
    </div>
  );
}

function diffPct(current: number, baseline: number): number | null {
  if (baseline <= 0 || current <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function AccCard({
  label,
  kwh,
  cost,
  comparison,
  compareLabel,
}: {
  label: string;
  kwh: number;
  cost: number | null;
  comparison: number | null;
  compareLabel: string;
}) {
  const better = comparison != null && comparison < 0;
  const worse = comparison != null && comparison > 0;
  const toneColor = better
    ? "text-[oklch(0.72_0.16_150)]"
    : worse
      ? "text-[oklch(0.65_0.22_25)]"
      : "text-muted-foreground";
  const Icon = better ? TrendingDown : worse ? TrendingUp : Activity;

  return (
    <div className="panel rounded-md p-4 bg-background/40 border border-border/40">
      <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums text-primary mt-1">
        {kwh > 0 ? `${kwh.toFixed(kwh < 10 ? 2 : kwh < 100 ? 1 : 0)} kWh` : "—"}
      </div>
      {cost != null && (
        <div className="text-xs text-muted-foreground tabular-nums">
          ≈ {cost.toFixed(0)} kr
        </div>
      )}
      <div className={`mt-2 flex items-center gap-1.5 text-[11px] ${toneColor}`}>
        <Icon size={12} />
        {comparison != null ? (
          <span className="tabular-nums">
            {comparison > 0 ? "+" : ""}
            {comparison.toFixed(1)} % {better ? "lavere enn" : worse ? "høyere enn" : ""} {compareLabel.replace("vs ", "")}
          </span>
        ) : (
          <span>{compareLabel}</span>
        )}
      </div>
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

function formatWatt(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${Math.round(w)} W`;
}

function LivePulseBanner({ live }: { live: ReturnType<typeof useTibberLive> }) {
  const homes = [live.homes.tollnes, live.homes.hytta].filter((h) => h.status !== "idle");
  if (homes.length === 0) return null;
  return (
    <article className="panel rounded-lg p-4 border-[oklch(0.72_0.16_150)]/30 bg-[oklch(0.72_0.16_150)]/5">
      <div className="flex items-center gap-2 mb-2">
        <Radio size={14} className="text-[oklch(0.72_0.16_150)] animate-pulse" />
        <span className="text-[10px] tracking-[0.3em] uppercase text-[oklch(0.72_0.16_150)]">
          Pulse live · sanntid fra Tibber
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {homes.map((h) => (
          <div key={h.location} className="text-sm">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {h.location === "tollnes" ? "Borgen" : "Hytta"}
            </div>
            <div className="text-2xl font-semibold tabular-nums text-primary">
              {h.reading?.power != null ? formatWatt(h.reading.power) : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {h.reading?.accumulatedConsumption != null
                ? `${h.reading.accumulatedConsumption.toFixed(2)} kWh i dag`
                : h.status === "connecting"
                  ? "kobler til…"
                  : h.status === "error"
                    ? `feil: ${h.error ?? ""}`
                    : "venter…"}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

// ============================================================
// Pulse historikk-graf — bygges opp fra pulse_readings i DB
// ============================================================

function PulseHistoryChart({
  location,
  reading,
}: {
  location: "hytta" | "tollnes";
  reading: { receivedAt: number; power: number } | null;
}) {
  const fetchHistory = useServerFn(getPulseHistory);
  const [points, setPoints] = useState<PulseHistoryPoint[]>([]);
  const [prevPoints, setPrevPoints] = useState<PulseHistoryPoint[]>([]);
  // 2 = 2t, 6 = 6t, 24 = 24t, 72 = 3d, 168 = 7d, 744 = 31d
  const [hours, setHours] = useState<2 | 6 | 24 | 72 | 168 | 744>(24);
  const [showCompare, setShowCompare] = useState(true);

  // Re-fetch når reading kommer (max 1 gang per minutt for å ikke spamme)
  const lastFetchRef = (PulseHistoryChart as any)._lastFetch ??= new Map<string, number>();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [cur, prev] = await Promise.all([
          fetchHistory({ data: { location, hours } }),
          fetchHistory({ data: { location, hours, offsetHours: hours } }),
        ]);
        if (cancelled) return;
        setPoints(cur.points);
        setPrevPoints(prev.points);
      } catch (err) {
        console.warn("[pulse-history] fetch failed", err);
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchHistory, location, hours]);

  // Når en ny reading kommer (og det er minst 60s siden forrige fetch) → re-fetch
  useEffect(() => {
    if (!reading) return;
    const key = `${location}:${hours}`;
    const last = lastFetchRef.get(key) ?? 0;
    if (Date.now() - last < 60_000) return;
    lastFetchRef.set(key, Date.now());
    Promise.all([
      fetchHistory({ data: { location, hours } }),
      fetchHistory({ data: { location, hours, offsetHours: hours } }),
    ])
      .then(([cur, prev]) => {
        setPoints(cur.points);
        setPrevPoints(prev.points);
      })
      .catch(() => {});
  }, [reading?.receivedAt, location, hours, fetchHistory, lastFetchRef, reading]);

  const longRange = hours > 72;
  const fmtLabel = (d: Date) =>
    longRange
      ? d.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", timeZone: "Europe/Oslo" })
      : d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });

  // Bygg ett samlet datasett der både nå- og forrige-punkter får egne x-verdier
  // basert på tid (numerisk). Forrige periode forskyves `hours` timer fremover
  // slik at den ligger oppå nåperioden i x-aksen. Sparsomme data trenger ikke
  // matche eksakt — Recharts kobler punkter via connectNulls.
  const offsetMs = hours * 60 * 60 * 1000;
  type Row = { t: number; watt: number | null; prevWatt: number | null };
  const rows: Row[] = [];

  for (const p of points) {
    if (p.watt == null) continue;
    rows.push({ t: new Date(p.t).getTime(), watt: Math.round(p.watt), prevWatt: null });
  }
  if (showCompare) {
    for (const p of prevPoints) {
      if (p.watt == null) continue;
      rows.push({
        t: new Date(p.t).getTime() + offsetMs,
        watt: null,
        prevWatt: Math.round(p.watt),
      });
    }
  }
  rows.sort((a, b) => a.t - b.t);

  const chartData = rows.map((r) => ({
    t: r.t,
    label: fmtLabel(new Date(r.t)),
    watt: r.watt,
    prevWatt: r.prevWatt,
  }));

  const compareLabel =
    hours === 2 ? "2t før"
    : hours === 6 ? "6t før"
    : hours === 24 ? "i går"
    : hours === 72 ? "3d før"
    : hours === 168 ? "forrige uke"
    : "forrige 31d";

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-sm tracking-[0.3em] uppercase text-primary flex items-center gap-2">
          <Activity size={14} /> Pulse-historikk · effekt
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {([2, 6, 24, 72, 168, 744] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded border transition-colors ${
                  hours === h
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                }`}
              >
                {h === 2 ? "2t" : h === 6 ? "6t" : h === 24 ? "24t" : h === 72 ? "3d" : h === 168 ? "7d" : "31d"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCompare((v) => !v)}
            className={`text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded border transition-colors ${
              showCompare
                ? "border-[oklch(0.78_0.13_85)] text-[oklch(0.78_0.13_85)] bg-[oklch(0.78_0.13_85)]/10"
                : "border-border text-muted-foreground hover:text-[oklch(0.78_0.13_85)] hover:border-[oklch(0.78_0.13_85)]/40"
            }`}
            title="Vis/skjul sammenligning med forrige periode"
          >
            vs {compareLabel}
          </button>
        </div>
      </div>
      {chartData.length < 2 ? (
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground text-center px-4 panel rounded-md bg-background/30">
          Krøniken samler tall — grafen tegner seg selv etter hvert som Pulse rapporterer (1 punkt/min).
        </div>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id={`pulseFill-${location}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id={`pulseFillPrev-${location}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.13 85)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="oklch(0.78 0.13 85)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="oklch(0.3 0.02 270)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
                width={48}
                unit=" W"
              />
              <Tooltip trigger="click"
                contentStyle={{
                  background: "oklch(0.18 0.02 270)",
                  border: "1px solid oklch(0.3 0.02 270)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => {
                  if (v == null) return ["—", name];
                  if (name === "prevWatt") return [`${v} W`, compareLabel];
                  return [`${v} W`, "Nå"];
                }}
              />
              {showCompare && (
                <Area
                  type="monotone"
                  dataKey="prevWatt"
                  stroke="oklch(0.78 0.13 85)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill={`url(#pulseFillPrev-${location})`}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
              <Area
                type="monotone"
                dataKey="watt"
                stroke="oklch(0.65 0.18 250)"
                strokeWidth={2}
                fill={`url(#pulseFill-${location})`}
                isAnimationActive={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {showCompare && (
        <p className="text-[10px] text-muted-foreground/70 mt-2 italic">
          Dager uten Pulse-avlesninger fylles inn med daglig snitt-watt fra Pbth-historikken (kWh/dag ÷ 24t × 1000) — flat linje innenfor vinduet.
        </p>
      )}
    </div>
  );
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
  multiplier = 1,
}: {
  today: PricePoint[];
  tomorrow: PricePoint[];
  priceNow: number | null;
  multiplier?: number;
}) {
  const all = [...today, ...tomorrow];
  const min = Math.min(...all.map((p) => p.total * multiplier));
  const max = Math.max(...all.map((p) => p.total * multiplier));

  const data = all.map((p) => {
    const d = new Date(p.startsAt);
    const isTomorrow = tomorrow.includes(p);
    return {
      label: `${isTomorrow ? "i.m. " : ""}${d.getHours().toString().padStart(2, "0")}`,
      total: Math.round(p.total * multiplier * 1000) / 1000,
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
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
              width={48}
              unit=" kr"
            />
            <Tooltip trigger="click"
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
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
              width={42}
              unit=" kWh"
            />
            <Tooltip trigger="click"
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
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
              width={42}
              unit=" kWh"
            />
            <Tooltip trigger="click"
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
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 11 }}
              ticks={[1, 5, 9, 13, 17, 21, 25, 29]}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 11 }}
              width={40}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip trigger="click"
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
            <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} />
            <YAxis
              yAxisId="kwh"
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }}
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
            <Tooltip trigger="click"
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
// Akkumulert kWh per valgt måned — grønn graf med estimat
// ============================================================

function MonthlyAccumulatedChart({
  daily,
  monthly,
}: {
  daily: ConsumptionPoint[];
  monthly: ConsumptionPoint[];
}) {
  // Bygg liste over tilgjengelige måneder fra `monthly` (siste 13 mnd) — nyeste først
  const monthOptions = [...monthly]
    .sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime())
    .map((m) => {
      const d = new Date(m.from);
      const key = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7);
      const label = d.toLocaleDateString("nb-NO", {
        month: "long",
        year: "numeric",
        timeZone: "Europe/Oslo",
      });
      return { key, label, totalKwh: m.kwh ?? 0 };
    });

  const now = new Date();
  const currentKey = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7);
  const [selected, setSelected] = useState<string>(currentKey);

  const isCurrent = selected === currentKey;

  // Hent dagsdata for valgt måned hvis tilgjengelig (daily har siste ~60 dager)
  const dailyForMonth = daily.filter(
    (d) =>
      new Date(d.from).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }).slice(0, 7) ===
      selected,
  );

  const [yy, mm] = selected.split("-").map((s) => parseInt(s, 10));
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const today = isCurrent ? now.getDate() : daysInMonth;

  // Lag map dag -> kwh
  const byDay = new Map<number, number>();
  for (const d of dailyForMonth) {
    const day = new Date(d.from).getDate();
    byDay.set(day, d.kwh ?? 0);
  }

  // Bygg datasett: akkumulert + estimat (dotted) for resten av mnd
  let cum = 0;
  const points: Array<{
    day: number;
    actual: number | null;
    estimate: number | null;
  }> = [];

  // Fallback: hvis vi ikke har daglig data (eldre mnd) bruk månedstotal som "siste punkt"
  const monthlyTotal = monthOptions.find((m) => m.key === selected)?.totalKwh ?? 0;
  const hasDailyData = dailyForMonth.length > 0;

  if (hasDailyData) {
    for (let i = 1; i <= daysInMonth; i++) {
      let actual: number | null = null;
      if (i <= today) {
        cum += byDay.get(i) ?? 0;
        actual = Math.round(cum * 10) / 10;
      }
      points.push({ day: i, actual, estimate: null });
    }
  } else {
    // Eldre måned uten dagsdata — vis lineær akkumulering opp til total
    for (let i = 1; i <= daysInMonth; i++) {
      const v = (monthlyTotal * i) / daysInMonth;
      points.push({ day: i, actual: Math.round(v * 10) / 10, estimate: null });
    }
    cum = monthlyTotal;
  }

  // Estimat for resten av nåværende måned (basert på snitt per dag hittil)
  let estimatedTotal: number | null = null;
  if (isCurrent && hasDailyData && today > 0) {
    const avgPerDay = cum / today;
    estimatedTotal = avgPerDay * daysInMonth;
    let est = cum;
    for (let i = today + 1; i <= daysInMonth; i++) {
      est += avgPerDay;
      // Sett estimate-verdi, og la actual være null fra og med dag etter "today"
      points[i - 1].estimate = Math.round(est * 10) / 10;
    }
    // For å koble linjene må dag = today ha både actual og estimate
    if (points[today - 1]) {
      points[today - 1].estimate = points[today - 1].actual;
    }
  }

  const monthLabel =
    monthOptions.find((m) => m.key === selected)?.label ??
    new Date(yy, mm - 1, 1).toLocaleDateString("nb-NO", { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl bg-[oklch(0.18_0.02_270)] p-4 border border-border/40 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="flex items-center gap-1.5 text-foreground/85">
            <span className="inline-block w-3 h-3 rounded-sm bg-[oklch(0.7_0.18_150)]" />
            Akkumulert: <span className="tabular-nums">{cum.toFixed(0)} kWh</span>
          </span>
          {estimatedTotal != null && (
            <span className="flex items-center gap-1.5 text-foreground/65">
              <span className="inline-block w-3 h-0.5 bg-[oklch(0.7_0.18_150)]" style={{ borderTop: "2px dashed" }} />
              Estimert mnd: <span className="tabular-nums">{estimatedTotal.toFixed(0)} kWh</span>
            </span>
          )}
        </div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-[oklch(0.22_0.02_270)] border border-border/50 rounded-md px-2 py-1 text-xs text-foreground tabular-nums capitalize"
        >
          {monthOptions.map((m) => (
            <option key={m.key} value={m.key} className="capitalize">
              {m.label}
            </option>
          ))}
          {!monthOptions.some((m) => m.key === currentKey) && (
            <option value={currentKey} className="capitalize">
              {new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("nb-NO", {
                month: "long",
                year: "numeric",
              })}
            </option>
          )}
        </select>
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground capitalize">
        {monthLabel}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="kwhAccGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.18 150)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="oklch(0.7 0.18 150)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="kwhAccGreenEst" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.7 0.18 150)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="oklch(0.7 0.18 150)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.3 0.02 270)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 11 }}
              ticks={[1, 5, 9, 13, 17, 21, 25, 29]}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 11 }}
              width={40}
              axisLine={false}
              tickLine={false}
              unit=" kWh"
            />
            <Tooltip trigger="click"
              contentStyle={{
                background: "oklch(0.22 0.02 270)",
                border: "1px solid oklch(0.35 0.02 270)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v: unknown, name: unknown) =>
                typeof v === "number"
                  ? [`${v.toFixed(0)} kWh`, name === "actual" ? "Akkumulert" : "Estimat"]
                  : ["—", String(name)]
              }
              labelFormatter={(d: number) => `Dag ${d}`}
            />
            <Area
              type="monotone"
              dataKey="estimate"
              stroke="oklch(0.7 0.18 150)"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="url(#kwhAccGreenEst)"
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke="oklch(0.7 0.18 150)"
              strokeWidth={2.5}
              fill="url(#kwhAccGreen)"
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TrendStat({
  label,
  todayKwh,
  referenceKwh,
  trend,
  referenceFullDayKwh,
  referenceLabel,
}: {
  label: string;
  todayKwh: number;
  referenceKwh: number | null;
  trend: { diff: number; pct: number } | null;
  referenceFullDayKwh: number | null;
  referenceLabel: string;
}) {
  const hasData = trend != null && referenceKwh != null;
  const isUp = hasData && trend!.diff > 0;
  const isDown = hasData && trend!.diff < 0;
  // Mer forbruk = rødt, mindre = grønt
  const tone = isUp
    ? "text-[oklch(0.72_0.18_25)]"
    : isDown
      ? "text-[oklch(0.72_0.16_150)]"
      : "text-muted-foreground";
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Activity;
  const arrow = isUp ? "▲" : isDown ? "▼" : "•";
  const pctTxt = hasData ? `${trend!.pct > 0 ? "+" : ""}${trend!.pct.toFixed(0)} %` : "—";
  const diffTxt = hasData
    ? `${trend!.diff > 0 ? "+" : ""}${trend!.diff.toFixed(2)} kWh`
    : "—";
  return (
    <div className="rounded-md p-4 bg-background/30 border border-border/40">
      <div className="flex items-center justify-between">
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">{label}</div>
        <Icon size={14} className={tone} />
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${tone}`}>
        {arrow} {pctTxt}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{diffTxt}</div>
      <div className="text-[10px] text-muted-foreground/80 mt-1">
        {hasData
          ? `Nå ${todayKwh.toFixed(2)} kWh · ${referenceLabel} ${referenceKwh!.toFixed(2)} kWh same tid${referenceFullDayKwh != null ? ` (hele dagen ${referenceFullDayKwh.toFixed(1)} kWh)` : ""}`
          : `Mangler data fra ${referenceLabel}`}
      </div>
    </div>
  );
}



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
  borgenSpotNow = null,
  borgenSpotAvg = null,
  hyttaSpotNow = null,
  hyttaSpotAvg = null,
}: {
  tollnes: TibberHomeFull;
  hytta: TibberHomeFull;
  borgenSpotNow?: number | null;
  borgenSpotAvg?: number | null;
  hyttaSpotNow?: number | null;
  hyttaSpotAvg?: number | null;
}) {
  const fetchStored = useServerFn(getStoredDailyKwh);
  const [stored, setStored] = useState<StoredDailyKwh[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadStored = () => {
      fetchStored()
        .then((res) => {
          if (!cancelled && res.rows) setStored(res.rows);
        })
        .catch(() => {});
    };
    loadStored();
    const timer = window.setInterval(loadStored, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchStored]);

  if (!tollnes.found && !hytta.found) return null;

  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const monthKey = todayKey.slice(0, 7);

  const storedKwh = (location: "hytta" | "tollnes", day: string) =>
    stored.find((r) => r.location === location && r.day === day)?.kwh ?? null;
  const storedMonthKwh = (location: "hytta" | "tollnes") =>
    stored
      .filter((r) => r.location === location && r.day.startsWith(monthKey))
      .reduce((sum, r) => sum + r.kwh, 0);
  const storedYearKwh = (location: "hytta" | "tollnes") =>
    stored
      .filter((r) => r.location === location && r.day.startsWith(todayKey.slice(0, 4)))
      .reduce((sum, r) => sum + r.kwh, 0);
  const preferPositive = (primary: number | null | undefined, fallback: number | null | undefined) =>
    primary != null && primary > 0 ? primary : fallback != null && fallback > 0 ? fallback : primary ?? fallback ?? null;

  const tollnesToday = preferPositive(tollnes.todayKwh, storedKwh("tollnes", todayKey));
  const hyttaToday = preferPositive(hytta.todayKwh, storedKwh("hytta", todayKey));
  const tollnesYesterday = preferPositive(tollnes.yesterdayKwh, storedKwh("tollnes", yesterdayKey));
  const hyttaYesterday = preferPositive(hytta.yesterdayKwh, storedKwh("hytta", yesterdayKey));
  const tollnesThisMonth = preferPositive(tollnes.thisMonthKwh, storedMonthKwh("tollnes"));
  const hyttaThisMonth = preferPositive(hytta.thisMonthKwh, storedMonthKwh("hytta"));
  const tollnesThisYear = preferPositive(tollnes.thisYearKwh, storedYearKwh("tollnes"));
  const hyttaThisYear = preferPositive(hytta.thisYearKwh, storedYearKwh("hytta"));

  // Pris for nåværende time fra dagens prisliste (samme verdi som vises i grafen)
  const currentHourTotal = (list: Array<{ startsAt: string; total: number }>) => {
    if (!list.length) return null;
    const now = Date.now();
    const match = list.find((p) => {
      const start = new Date(p.startsAt).getTime();
      return now >= start && now < start + 3_600_000;
    });
    return match?.total ?? null;
  };
  const tollnesPriceNow = currentHourTotal(tollnes.pricesToday) ?? borgenSpotNow;
  const hyttaPriceNow = currentHourTotal(hytta.pricesToday) ?? hyttaSpotNow;

  // Beregn kostnad fra kWh × snittpris × multiplier hvis Tibber ikke har cost.
  // Snittpris brukes som proxy når vi ikke har timesoppdelte priser for perioden.
  const tollnesAvg = tollnes.priceAvgToday ?? borgenSpotAvg;
  const hyttaAvg = hytta.priceAvgToday ?? hyttaSpotAvg;
  const calcCost = (
    tibberCost: number | null | undefined,
    kwh: number | null | undefined,
    avg: number | null | undefined,
    multiplier: number,
  ): number | null => {
    if (tibberCost != null && tibberCost > 0) return tibberCost;
    if (kwh != null && kwh > 0 && avg != null && avg > 0) return kwh * avg * multiplier;
    return null;
  };

  const rows: Array<{ label: string; b?: number | null; h?: number | null; unit: string; precision: number }> = [
    { label: "Pris nå", b: tollnesPriceNow != null ? tollnesPriceNow * 1.9 : null, h: hyttaPriceNow != null ? hyttaPriceNow * 1.52 : null, unit: "kr/kWh", precision: 3 },
    { label: "Snittpris i dag", b: tollnesAvg != null ? tollnesAvg * 1.9 : null, h: hyttaAvg != null ? hyttaAvg * 1.52 : null, unit: "kr/kWh", precision: 3 },
    { label: "kWh i dag", b: tollnesToday, h: hyttaToday, unit: "kWh", precision: 1 },
    { label: "Kostnad i dag", b: calcCost(tollnes.todayCost, tollnesToday, tollnesAvg, 1.9), h: calcCost(hytta.todayCost, hyttaToday, hyttaAvg, 1.52), unit: "kr", precision: 0 },
    { label: "kWh i går", b: tollnesYesterday, h: hyttaYesterday, unit: "kWh", precision: 1 },
    { label: "Kostnad i går", b: calcCost(tollnes.yesterdayCost, tollnesYesterday, tollnesAvg, 1.9), h: calcCost(hytta.yesterdayCost, hyttaYesterday, hyttaAvg, 1.52), unit: "kr", precision: 0 },
    { label: "kWh denne måneden", b: tollnesThisMonth, h: hyttaThisMonth, unit: "kWh", precision: 0 },
    { label: "Kostnad denne måneden", b: calcCost(tollnes.thisMonthCost, tollnesThisMonth, tollnesAvg, 1.9), h: calcCost(hytta.thisMonthCost, hyttaThisMonth, hyttaAvg, 1.52), unit: "kr", precision: 0 },
    { label: "kWh forrige måned", b: tollnes.lastMonthKwh, h: hytta.lastMonthKwh, unit: "kWh", precision: 0 },
    { label: "Kostnad forrige måned", b: calcCost(tollnes.lastMonthCost, tollnes.lastMonthKwh, tollnesAvg, 1.9), h: calcCost(hytta.lastMonthCost, hytta.lastMonthKwh, hyttaAvg, 1.52), unit: "kr", precision: 0 },
    { label: "kWh i år", b: tollnesThisYear, h: hyttaThisYear, unit: "kWh", precision: 0 },
    { label: "Kostnad i år", b: calcCost(tollnes.thisYearCost, tollnesThisYear, tollnesAvg, 1.9), h: calcCost(hytta.thisYearCost, hyttaThisYear, hyttaAvg, 1.52), unit: "kr", precision: 0 },
  ];

  const chartData = rows
    .filter((r) => r.unit === "kr" && ((r.b ?? 0) > 0 || (r.h ?? 0) > 0))
    .map((r) => ({
      label: r.label.replace("Kostnad ", ""),
      Borgen: r.b ?? 0,
      Hytta: r.h ?? 0,
    }));

  // kWh-sammenligning per periode (basert på samme tabell-data)
  const kwhChartData = rows
    .filter((r) => r.unit === "kWh" && ((r.b ?? 0) > 0 || (r.h ?? 0) > 0))
    .map((r) => ({
      label: r.label.replace("kWh ", ""),
      Borgen: r.b ?? 0,
      Hytta: r.h ?? 0,
    }));

  // Historisk månedlig forbruk — slå sammen begge hjem på samme x-akse
  const monthMap = new Map<string, { month: string; Borgen: number; Hytta: number }>();

  // Først: aggregér fra lagrede daglige snapshots (som dekker manglende abo)
  for (const r of stored) {
    const key = r.day.slice(0, 7);
    if (!key) continue;
    const cur = monthMap.get(key) ?? { month: key, Borgen: 0, Hytta: 0 };
    if (r.location === "tollnes") cur.Borgen += r.kwh;
    else if (r.location === "hytta") cur.Hytta += r.kwh;
    monthMap.set(key, cur);
  }

  // Så: overstyr med Tibber-API når data finnes
  for (const m of tollnes.monthly ?? []) {
    const key = (m.from ?? "").slice(0, 7);
    if (!key || m.kwh == null || m.kwh <= 0) continue;
    const cur = monthMap.get(key) ?? { month: key, Borgen: 0, Hytta: 0 };
    cur.Borgen = m.kwh;
    monthMap.set(key, cur);
  }
  for (const m of hytta.monthly ?? []) {
    const key = (m.from ?? "").slice(0, 7);
    if (!key || m.kwh == null || m.kwh <= 0) continue;
    const cur = monthMap.get(key) ?? { month: key, Borgen: 0, Hytta: 0 };
    cur.Hytta = m.kwh;
    monthMap.set(key, cur);
  }
  const monthlyChartData = Array.from(monthMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((d) => ({
      label: d.month.slice(5) + "/" + d.month.slice(2, 4),
      Borgen: Math.round(d.Borgen * 10) / 10,
      Hytta: Math.round(d.Hytta * 10) / 10,
    }));

  // Historisk daglig forbruk — slå sammen Tibber-API (de få dagene de gir oss)
  // og lagrede snapshots fra databasen (vår egen historikk siden vi ikke har abo)
  const dayMap = new Map<string, { day: string; Borgen: number; Hytta: number }>();

  // Først: lagrede snapshots (basislaget)
  for (const r of stored) {
    const key = r.day;
    if (!key) continue;
    const cur = dayMap.get(key) ?? { day: key, Borgen: 0, Hytta: 0 };
    if (r.location === "tollnes") cur.Borgen = r.kwh;
    else if (r.location === "hytta") cur.Hytta = r.kwh;
    dayMap.set(key, cur);
  }

  // Så: live Tibber-data overstyrer for de dagene de finnes (mest oppdatert)
  for (const d of tollnes.daily ?? []) {
    const key = (d.from ?? "").slice(0, 10);
    if (!key || d.kwh == null || d.kwh <= 0) continue;
    const cur = dayMap.get(key) ?? { day: key, Borgen: 0, Hytta: 0 };
    cur.Borgen = d.kwh;
    dayMap.set(key, cur);
  }
  for (const d of hytta.daily ?? []) {
    const key = (d.from ?? "").slice(0, 10);
    if (!key || d.kwh == null || d.kwh <= 0) continue;
    const cur = dayMap.get(key) ?? { day: key, Borgen: 0, Hytta: 0 };
    cur.Hytta = d.kwh;
    dayMap.set(key, cur);
  }
  const dailySorted = Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day));
  const dailyChartData = dailySorted.map((d) => ({
    label: d.day.slice(8) + "." + d.day.slice(5, 7),
    Borgen: Math.round(d.Borgen * 10) / 10,
    Hytta: Math.round(d.Hytta * 10) / 10,
  }));

  // Kumulativ kWh for inneværende måned — fra dag 1 til siste dag i måneden.
  // Tomme dager fram i tid vises ikke (kurven stopper på "i dag").
  const _now = new Date();
  const _yyyymm = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;
  const _todayKey = `${_yyyymm}-${String(_now.getDate()).padStart(2, "0")}`;
  const monthDays = dailySorted.filter((d) => d.day.startsWith(_yyyymm) && d.day <= _todayKey);
  let cumB = 0;
  let cumH = 0;
  const cumulativeChartData = monthDays.map((d) => {
    cumB += d.Borgen ?? 0;
    cumH += d.Hytta ?? 0;
    return {
      label: d.day.slice(8), // dag i måneden
      Borgen: Math.round(cumB * 10) / 10,
      Hytta: Math.round(cumH * 10) / 10,
    };
  });
  const _monthLabel = _now.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });

  // Årlig forbruk — start med lagrede daglige snapshots, ellers blir den tom uten Tibber-abo.
  const yearMap = new Map<string, { year: string; Borgen: number; Hytta: number }>();
  for (const r of stored) {
    const key = r.day.slice(0, 4);
    if (!key) continue;
    const cur = yearMap.get(key) ?? { year: key, Borgen: 0, Hytta: 0 };
    if (r.location === "tollnes") cur.Borgen += r.kwh;
    else if (r.location === "hytta") cur.Hytta += r.kwh;
    yearMap.set(key, cur);
  }
  for (const y of tollnes.yearly ?? []) {
    const key = (y.from ?? "").slice(0, 4);
    if (!key || y.kwh == null || y.kwh <= 0) continue;
    const cur = yearMap.get(key) ?? { year: key, Borgen: 0, Hytta: 0 };
    cur.Borgen = y.kwh;
    yearMap.set(key, cur);
  }
  for (const y of hytta.yearly ?? []) {
    const key = (y.from ?? "").slice(0, 4);
    if (!key || y.kwh == null || y.kwh <= 0) continue;
    const cur = yearMap.get(key) ?? { year: key, Borgen: 0, Hytta: 0 };
    cur.Hytta = y.kwh;
    yearMap.set(key, cur);
  }
  const yearlyChartData = Array.from(yearMap.values())
    .sort((a, b) => a.year.localeCompare(b.year))
    .map((d) => ({
      label: d.year,
      Borgen: Math.round(d.Borgen),
      Hytta: Math.round(d.Hytta),
    }));

  const BORGEN_COLOR = "oklch(0.62 0.18 250)";
  const HYTTA_COLOR = "oklch(0.78 0.13 85)";
  const tooltipStyle = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 12,
  } as const;

  return (
    <article className="panel rounded-lg p-5 sm:p-7 border-primary/30">
      <h2 className="text-2xl text-primary mb-4 flex items-center gap-2">
        <Crown size={20} /> De to husene side om side
      </h2>

      {chartData.length > 0 && (
        <div className="h-64 w-full mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} />
              <YAxis tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} width={48} unit=" kr" />
              <Tooltip trigger="click"
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
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

      {/* Grafer basert på tabell-tallene over */}
      <div className="mt-8 space-y-8">
        <h3 className="text-sm tracking-[0.3em] uppercase text-primary flex items-center gap-2">
          <TrendingUp size={14} /> Grafer fra tabellen
        </h3>

        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
            kWh per periode {kwhChartData.length === 0 && <span className="italic normal-case tracking-normal">· venter på data</span>}
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kwhChartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} />
                <YAxis tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} width={48} unit=" kWh" />
                <Tooltip trigger="click" contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} kWh`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Borgen" fill={BORGEN_COLOR} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Hytta" fill={HYTTA_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
            Måned for måned {monthlyChartData.length > 0 ? `· siste ${monthlyChartData.length}` : <span className="italic normal-case tracking-normal">· venter på data</span>}
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} />
                <YAxis tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} width={48} unit=" kWh" />
                <Tooltip trigger="click" contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(0)} kWh`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Borgen" fill={BORGEN_COLOR} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Hytta" fill={HYTTA_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
            Daglig forbruk {dailyChartData.length > 0 ? `· siste ${dailyChartData.length} dager` : <span className="italic normal-case tracking-normal">· venter på data</span>}
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 9 }} interval={Math.max(0, Math.floor(dailyChartData.length / 10))} />
                <YAxis tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} width={48} unit=" kWh" />
                <Tooltip trigger="click" contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} kWh`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Borgen" stroke={BORGEN_COLOR} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="Hytta" stroke={HYTTA_COLOR} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
            Kumulativ kWh · {_monthLabel} {cumulativeChartData.length === 0 && <span className="italic normal-case tracking-normal">· venter på data</span>}
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulativeChartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 9 }} interval={Math.max(0, Math.floor(cumulativeChartData.length / 10))} />
                <YAxis tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} width={56} unit=" kWh" />
                <Tooltip trigger="click" contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(0)} kWh`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Borgen" stroke={BORGEN_COLOR} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="Hytta" stroke={HYTTA_COLOR} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
            År for år {yearlyChartData.length === 0 && <span className="italic normal-case tracking-normal">· venter på data</span>}
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyChartData} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} />
                <YAxis tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} width={56} unit=" kWh" />
                <Tooltip trigger="click" contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(0)} kWh`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Borgen" fill={BORGEN_COLOR} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Hytta" fill={HYTTA_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <DeepInsightsBlock
        dailySorted={dailySorted}
        yearlyChartData={yearlyChartData}
        monthlyChartData={monthlyChartData}
        tollnesAvg={tollnesAvg}
        hyttaAvg={hyttaAvg}
        borgenColor={BORGEN_COLOR}
        hyttaColor={HYTTA_COLOR}
        tooltipStyle={tooltipStyle}
      />

      <p className="text-xs text-muted-foreground mt-6 italic">
        — Husets samlede regnskap, hentet direkte fra Tibber.
      </p>
    </article>
  );
}

// ============================================================
// Dypere innsikt — estimater, ukedagsprofil, kostnader, topp-dager
// ============================================================

function DeepInsightsBlock({
  dailySorted,
  yearlyChartData,
  monthlyChartData,
  tollnesAvg,
  hyttaAvg,
  borgenColor,
  hyttaColor,
  tooltipStyle,
}: {
  dailySorted: Array<{ day: string; Borgen: number; Hytta: number }>;
  yearlyChartData: Array<{ label: string; Borgen: number; Hytta: number }>;
  monthlyChartData: Array<{ label: string; Borgen: number; Hytta: number }>;
  tollnesAvg: number | null;
  hyttaAvg: number | null;
  borgenColor: string;
  hyttaColor: string;
  tooltipStyle: React.CSSProperties;
}) {
  const BORGEN_MULT = 1.9;
  const HYTTA_MULT = 1.52;

  // ─── Snitt siste 30 dager (kun dager med data > 0) ───
  const last30 = dailySorted.slice(-30);
  const avg = (key: "Borgen" | "Hytta") => {
    const vals = last30.map((d) => d[key]).filter((v) => v > 0);
    if (vals.length === 0) return 0;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };
  const avgDayB = avg("Borgen");
  const avgDayH = avg("Hytta");

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const priceB = tollnesAvg != null ? tollnesAvg * BORGEN_MULT : null;
  const priceH = hyttaAvg != null ? hyttaAvg * HYTTA_MULT : null;

  const estMonthB = avgDayB * daysInMonth;
  const estMonthH = avgDayH * daysInMonth;
  const estYearB = avgDayB * 365;
  const estYearH = avgDayH * 365;
  const estMonthCostB = priceB != null ? estMonthB * priceB : null;
  const estMonthCostH = priceH != null ? estMonthH * priceH : null;
  const estYearCostB = priceB != null ? estYearB * priceB : null;
  const estYearCostH = priceH != null ? estYearH * priceH : null;

  // ─── Ukedagsprofil siste 90 dager ───
  const last90 = dailySorted.slice(-90);
  const wdLabels = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
  const wdAgg: Array<{ b: number[]; h: number[] }> = Array.from(
    { length: 7 },
    () => ({ b: [], h: [] }),
  );
  for (const d of last90) {
    const wd = new Date(d.day + "T12:00:00Z").getUTCDay();
    if (d.Borgen > 0) wdAgg[wd].b.push(d.Borgen);
    if (d.Hytta > 0) wdAgg[wd].h.push(d.Hytta);
  }
  const weekdayChart = [1, 2, 3, 4, 5, 6, 0].map((idx) => ({
    label: wdLabels[idx],
    Borgen:
      wdAgg[idx].b.length > 0
        ? Math.round(
            (wdAgg[idx].b.reduce((s, v) => s + v, 0) / wdAgg[idx].b.length) * 10,
          ) / 10
        : 0,
    Hytta:
      wdAgg[idx].h.length > 0
        ? Math.round(
            (wdAgg[idx].h.reduce((s, v) => s + v, 0) / wdAgg[idx].h.length) * 10,
          ) / 10
        : 0,
  }));

  // ─── Månedskostnad (kr) basert på snittpris × kWh ───
  const monthlyCostChart = monthlyChartData.map((m) => ({
    label: m.label,
    Borgen: priceB != null ? Math.round(m.Borgen * priceB) : 0,
    Hytta: priceH != null ? Math.round(m.Hytta * priceH) : 0,
  }));

  // ─── År-over-år endring ───
  const yoy = yearlyChartData.map((y, i) => {
    const prev = i > 0 ? yearlyChartData[i - 1] : null;
    const dB = prev && prev.Borgen > 0 ? ((y.Borgen - prev.Borgen) / prev.Borgen) * 100 : null;
    const dH = prev && prev.Hytta > 0 ? ((y.Hytta - prev.Hytta) / prev.Hytta) * 100 : null;
    return { ...y, dB, dH };
  });

  // ─── Topp 5 dyreste dager (sum begge hus) ───
  const topDays = [...dailySorted]
    .map((d) => ({ ...d, sum: d.Borgen + d.Hytta }))
    .filter((d) => d.sum > 0)
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 5);

  // ─── Billigste 5 dager ───
  const cheapestDays = [...dailySorted]
    .map((d) => ({ ...d, sum: d.Borgen + d.Hytta }))
    .filter((d) => d.sum > 0)
    .sort((a, b) => a.sum - b.sum)
    .slice(0, 5);

  const fmtNok = (v: number | null) => (v != null ? `${Math.round(v).toLocaleString("nb-NO")} kr` : "—");
  const fmtKwh = (v: number | null) => (v != null ? `${Math.round(v).toLocaleString("nb-NO")} kWh` : "—");
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y.slice(2)}`;
  };

  return (
    <div className="mt-10 space-y-8">
      <h3 className="text-sm tracking-[0.3em] uppercase text-primary flex items-center gap-2">
        <Sparkles size={14} /> Krønikens dypere innsikt — estimater og mønstre
      </h3>

      {/* Estimat-kort */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="panel rounded-md p-4 bg-background/40 border border-border/40 space-y-3">
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground flex items-center gap-2">
            <Crown size={12} /> Borgen · antatt forbruk og pris
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Snitt/dag</div>
              <div className="text-xl font-semibold tabular-nums text-primary">{avgDayB > 0 ? avgDayB.toFixed(1) : "—"} kWh</div>
              <div className="text-[10px] text-muted-foreground">siste 30 dager</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Antatt mnd</div>
              <div className="text-xl font-semibold tabular-nums text-primary">{estMonthB > 0 ? fmtKwh(estMonthB) : "—"}</div>
              <div className="text-[10px] text-muted-foreground">≈ {fmtNok(estMonthCostB)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Antatt år</div>
              <div className="text-xl font-semibold tabular-nums text-primary">{estYearB > 0 ? fmtKwh(estYearB) : "—"}</div>
              <div className="text-[10px] text-muted-foreground">≈ {fmtNok(estYearCostB)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Snittpris nå</div>
              <div className="text-xl font-semibold tabular-nums text-[oklch(0.78_0.13_85)]">{priceB != null ? `${priceB.toFixed(2)} kr` : "—"}</div>
              <div className="text-[10px] text-muted-foreground">per kWh inkl. påslag</div>
            </div>
          </div>
        </div>
        <div className="panel rounded-md p-4 bg-background/40 border border-border/40 space-y-3">
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground flex items-center gap-2">
            <Crown size={12} /> Hytta · antatt forbruk og pris
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Snitt/dag</div>
              <div className="text-xl font-semibold tabular-nums text-primary">{avgDayH > 0 ? avgDayH.toFixed(1) : "—"} kWh</div>
              <div className="text-[10px] text-muted-foreground">siste 30 dager</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Antatt mnd</div>
              <div className="text-xl font-semibold tabular-nums text-primary">{estMonthH > 0 ? fmtKwh(estMonthH) : "—"}</div>
              <div className="text-[10px] text-muted-foreground">≈ {fmtNok(estMonthCostH)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Antatt år</div>
              <div className="text-xl font-semibold tabular-nums text-primary">{estYearH > 0 ? fmtKwh(estYearH) : "—"}</div>
              <div className="text-[10px] text-muted-foreground">≈ {fmtNok(estYearCostH)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Snittpris nå</div>
              <div className="text-xl font-semibold tabular-nums text-[oklch(0.78_0.13_85)]">{priceH != null ? `${priceH.toFixed(2)} kr` : "—"}</div>
              <div className="text-[10px] text-muted-foreground">per kWh inkl. påslag</div>
            </div>
          </div>
        </div>
      </div>

      {/* Antatt sum begge hus */}
      <div className="panel rounded-md p-4 bg-background/30 border border-border/40 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Antatt forbruk i mnd · sum</div>
          <div className="text-xl font-semibold tabular-nums text-primary">{fmtKwh(estMonthB + estMonthH)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Antatt kostnad i mnd · sum</div>
          <div className="text-xl font-semibold tabular-nums text-[oklch(0.78_0.13_85)]">{fmtNok((estMonthCostB ?? 0) + (estMonthCostH ?? 0))}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Antatt forbruk i år · sum</div>
          <div className="text-xl font-semibold tabular-nums text-primary">{fmtKwh(estYearB + estYearH)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Antatt kostnad i år · sum</div>
          <div className="text-xl font-semibold tabular-nums text-[oklch(0.78_0.13_85)]">{fmtNok((estYearCostB ?? 0) + (estYearCostH ?? 0))}</div>
        </div>
      </div>

      {/* Ukedagsprofil */}
      <div>
        <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
          Ukedagsprofil · snitt kWh per ukedag (siste 90 dager)
        </p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayChart} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} />
              <YAxis tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} width={48} unit=" kWh" />
              <Tooltip trigger="click" contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} kWh`, ""]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Borgen" fill={borgenColor} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Hytta" fill={hyttaColor} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Månedskostnad i kr */}
      <div>
        <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
          Antatt månedskostnad · kr (kWh × dagens snittpris inkl. påslag)
        </p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyCostChart} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} />
              <YAxis tick={{ fill: "oklch(0.78 0.13 85)", fontSize: 10 }} width={56} unit=" kr" />
              <Tooltip trigger="click" contentStyle={tooltipStyle} formatter={(v: number) => [`${Math.round(v).toLocaleString("nb-NO")} kr`, ""]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Borgen" stackId="kr" fill={borgenColor} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Hytta" stackId="kr" fill={hyttaColor} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-2 italic">
          NB: estimat — historiske spotpriser per måned er ikke lagret, så vi bruker dagens snittpris × historisk kWh.
        </p>
      </div>

      {/* År for år endringstabell */}
      {yoy.length > 0 && (
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
            År for år · endring
          </p>
          <div className="overflow-x-auto rounded-xl bg-[oklch(0.18_0.02_270)] border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">År</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-primary font-normal">Borgen</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">Δ</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-[oklch(0.78_0.13_85)] font-normal">Hytta</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">Δ</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">Sum</th>
                </tr>
              </thead>
              <tbody>
                {yoy.map((y) => {
                  const tone = (d: number | null) =>
                    d == null ? "text-muted-foreground" : d > 0 ? "text-[oklch(0.7_0.18_25)]" : "text-[oklch(0.72_0.16_150)]";
                  return (
                    <tr key={y.label} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-2 text-foreground/85">{y.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtKwh(y.Borgen)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${tone(y.dB)}`}>
                        {y.dB != null ? `${y.dB > 0 ? "+" : ""}${y.dB.toFixed(1)} %` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{fmtKwh(y.Hytta)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${tone(y.dH)}`}>
                        {y.dH != null ? `${y.dH > 0 ? "+" : ""}${y.dH.toFixed(1)} %` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary font-semibold">{fmtKwh(y.Borgen + y.Hytta)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Topp dyreste/billigste dager */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-[oklch(0.7_0.18_25)]" /> Topp 5 dyreste dager
          </p>
          <div className="overflow-x-auto rounded-xl bg-[oklch(0.18_0.02_270)] border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">Dato</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-primary font-normal">Borgen</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-[oklch(0.78_0.13_85)] font-normal">Hytta</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-[oklch(0.7_0.18_25)] font-normal">Sum</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">≈ kr</th>
                </tr>
              </thead>
              <tbody>
                {topDays.map((d) => {
                  const cost =
                    (priceB != null ? d.Borgen * priceB : 0) +
                    (priceH != null ? d.Hytta * priceH : 0);
                  return (
                    <tr key={d.day} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-2 text-foreground/85">{fmtDate(d.day)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.Borgen > 0 ? `${d.Borgen.toFixed(1)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.Hytta > 0 ? `${d.Hytta.toFixed(1)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[oklch(0.7_0.18_25)] font-semibold">{d.sum.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{cost > 0 ? fmtNok(cost) : "—"}</td>
                    </tr>
                  );
                })}
                {topDays.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground italic">venter på data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingDown size={11} className="text-[oklch(0.72_0.16_150)]" /> Topp 5 billigste dager
          </p>
          <div className="overflow-x-auto rounded-xl bg-[oklch(0.18_0.02_270)] border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">Dato</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-primary font-normal">Borgen</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-[oklch(0.78_0.13_85)] font-normal">Hytta</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-[oklch(0.72_0.16_150)] font-normal">Sum</th>
                  <th className="text-right px-3 py-2 text-[10px] tracking-[0.25em] uppercase text-muted-foreground font-normal">≈ kr</th>
                </tr>
              </thead>
              <tbody>
                {cheapestDays.map((d) => {
                  const cost =
                    (priceB != null ? d.Borgen * priceB : 0) +
                    (priceH != null ? d.Hytta * priceH : 0);
                  return (
                    <tr key={d.day} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-2 text-foreground/85">{fmtDate(d.day)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.Borgen > 0 ? `${d.Borgen.toFixed(1)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.Hytta > 0 ? `${d.Hytta.toFixed(1)}` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[oklch(0.72_0.16_150)] font-semibold">{d.sum.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{cost > 0 ? fmtNok(cost) : "—"}</td>
                    </tr>
                  );
                })}
                {cheapestDays.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground italic">venter på data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

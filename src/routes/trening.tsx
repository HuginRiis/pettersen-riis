import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PageHero } from "@/components/PageShell";
import { ActivityMap } from "@/components/ActivityMap";
import { getStravaDashboard, getStravaStatus } from "@/server/strava";
import treningImg from "@/assets/trening.jpg";

export const Route = createFileRoute("/trening")({
  head: () => ({
    meta: [
      { title: "Treningssalen — Kroppen som rustning | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Husets treningskrønike — Arnes Strava-data, ukens innsats, trender, totaler og siste turer på kart.",
      },
      { property: "og:title", content: "Treningssalen | House Pettersen Riis" },
      { property: "og:description", content: "Styrke, utholdenhet og disiplin." },
      { property: "og:image", content: treningImg },
    ],
  }),
  component: TreningPage,
});

type TotalBlock = {
  count: number;
  distance: number;
  moving_time: number;
  elevation_gain: number;
};

type StatusState =
  | { kind: "loading" }
  | { kind: "disconnected" }
  | { kind: "connected"; athleteName: string | null };

type DashOk = {
  athleteName: string | null;
  week: {
    count: number;
    distanceMeters: number;
    movingSeconds: number;
    elevationMeters: number;
    avgHeartrate: number | null;
  };
  weeklyTrend: Array<{
    weekStart: string;
    label: string;
    distanceKm: number;
    movingMin: number;
    elevation: number;
    count: number;
  }>;
  sportBreakdown: Array<{
    sport: string;
    count: number;
    distance: number;
    movingTime: number;
    elevation: number;
  }>;
  records: {
    longestDistance: SlimAct | null;
    longestTime: SlimAct | null;
    mostElevation: SlimAct | null;
    maxHr: SlimAct | null;
    maxSpeed: SlimAct | null;
  };
  totals: {
    recentRun: TotalBlock | null;
    recentRide: TotalBlock | null;
    recentSwim: TotalBlock | null;
    ytdRun: TotalBlock | null;
    ytdRide: TotalBlock | null;
    ytdSwim: TotalBlock | null;
    allRun: TotalBlock | null;
    allRide: TotalBlock | null;
    allSwim: TotalBlock | null;
    biggestRide: number | null;
    biggestClimb: number | null;
  } | null;
  activities: Array<{
    id: number;
    name: string;
    type: string;
    distance: number;
    movingTime: number;
    elevation: number;
    startDate: string;
    avgHeartrate: number | null;
    maxHeartrate: number | null;
    avgSpeed: number | null;
    maxSpeed: number | null;
    polyline: string | null;
    kudos: number;
    achievements: number;
  }>;
};

type SlimAct = {
  id: number;
  name: string;
  type: string;
  distance: number;
  movingTime: number;
  elevation: number;
  startDate: string;
  maxHeartrate: number | null;
  maxSpeed: number | null;
};

type DashState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | ({ kind: "ok" } & DashOk);

function formatKm(m: number) {
  return `${(m / 1000).toFixed(1)} km`;
}
function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}t ${m}m`;
  return `${m} min`;
}
function formatPace(distM: number, timeS: number) {
  if (!distM || !timeS) return "—";
  const minPerKm = timeS / 60 / (distM / 1000);
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}
function formatSpeedKmh(mps: number | null) {
  if (!mps) return "—";
  return `${(mps * 3.6).toFixed(1)} km/t`;
}
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function activityIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("run")) return "🏃";
  if (t.includes("ride") || t.includes("cycl") || t.includes("bike")) return "🚴";
  if (t.includes("swim")) return "🏊";
  if (t.includes("hike")) return "🥾";
  if (t.includes("walk")) return "🚶";
  if (t.includes("ski")) return "⛷";
  if (t.includes("workout") || t.includes("strength")) return "🏋";
  return "⚔";
}
function sportLabel(s: string) {
  switch (s) {
    case "run":
      return "Løping";
    case "ride":
      return "Sykling";
    case "swim":
      return "Svømming";
    case "hike":
      return "Fjelltur";
    case "walk":
      return "Gåtur";
    case "ski":
      return "Ski";
    default:
      return "Annet";
  }
}
function sportColor(s: string) {
  switch (s) {
    case "run":
      return "hsl(var(--primary))";
    case "ride":
      return "#5b9dd9";
    case "swim":
      return "#56b9b3";
    case "hike":
      return "#a37b3a";
    case "walk":
      return "#9b8456";
    case "ski":
      return "#cfd8e3";
    default:
      return "#7a7568";
  }
}

function TreningPage() {
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [dash, setDash] = useState<DashState>({ kind: "idle" });
  const fetchStatus = useServerFn(getStravaStatus);
  const fetchDash = useServerFn(getStravaDashboard);

  const loadStatus = async () => {
    try {
      const s = await fetchStatus();
      if (s.connected) {
        setStatus({ kind: "connected", athleteName: s.athleteName });
      } else {
        setStatus({ kind: "disconnected" });
        setDash({ kind: "idle" });
      }
    } catch {
      setStatus({ kind: "disconnected" });
    }
  };

  const loadDash = async () => {
    setDash({ kind: "loading" });
    try {
      const res = await fetchDash();
      if (res.ok) {
        setDash({ kind: "ok", ...res });
      } else {
        setDash({ kind: "error", message: res.error });
      }
    } catch (e: any) {
      setDash({ kind: "error", message: e?.message ?? "Ukjent feil" });
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status.kind === "connected") loadDash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.kind]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets disiplin"
        title="Treningssalen"
        subtitle="Kroppen er rustning. Disiplin er sverd."
        image={treningImg}
      />

      <section className="container mx-auto px-4 py-12">
        <div className="ornate-divider mb-8">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Arnes Krønike · Strava
          </span>
        </div>

        {status.kind === "loading" && (
          <p className="text-center text-sm text-muted-foreground">Sender bud til Strava…</p>
        )}

        {status.kind === "disconnected" && (
          <div className="panel rounded-lg p-8 text-center max-w-xl mx-auto">
            <p className="text-medieval text-lg text-primary mb-2">Krøniken er ikke lenket</p>
            <p className="text-sm text-muted-foreground mb-6">
              Koble Arnes Strava for å vise ukens innsats, siste turer og kart fra marka.
            </p>
            <a
              href="/api/strava/start"
              className="inline-flex items-center gap-2 rounded-md bg-[#FC4C02] px-6 py-3 text-sm font-medium text-white hover:bg-[#e04400] transition-colors"
            >
              Koble til Strava
            </a>
          </div>
        )}

        {status.kind === "connected" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-muted-foreground">
                Lenket til{" "}
                <span className="text-primary text-medieval">
                  {dash.kind === "ok" && dash.athleteName
                    ? dash.athleteName
                    : status.athleteName ?? "Arne"}
                </span>
              </p>
              <button
                onClick={loadDash}
                disabled={dash.kind === "loading"}
                className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary disabled:opacity-50"
              >
                ↻ Oppfrisk krøniken
              </button>
            </div>

            {dash.kind === "loading" && (
              <p className="text-center text-sm text-muted-foreground italic">
                Budbringeren rir gjennom marka…
              </p>
            )}

            {dash.kind === "error" && (
              <div className="panel rounded-lg p-6 text-center max-w-xl mx-auto">
                <p className="text-xs tracking-[0.3em] text-destructive uppercase mb-2">
                  Budet kom ikke fram
                </p>
                <p className="text-xs text-muted-foreground">{dash.message}</p>
              </div>
            )}

            {dash.kind === "ok" && <DashboardView dash={dash} />}
          </>
        )}
      </section>
    </PageShell>
  );
}

function DashboardView({ dash }: { dash: DashOk }) {
  return (
    <>
      {/* Ukens stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        <Stat label="Økter denne uka" value={String(dash.week.count)} hint="siden mandag" />
        <Stat label="Distanse" value={formatKm(dash.week.distanceMeters)} hint="totalt" />
        <Stat
          label="Tid i bevegelse"
          value={formatDuration(dash.week.movingSeconds)}
          hint="nettotid"
        />
        <Stat
          label="Stigning"
          value={`${Math.round(dash.week.elevationMeters)} m`}
          hint={
            dash.week.avgHeartrate ? `Snittpuls ${dash.week.avgHeartrate} bpm` : "høydemeter"
          }
        />
      </div>

      {/* 4 ukers trend */}
      <SubHeader text="4 ukers trend" />
      <WeeklyTrendChart data={dash.weeklyTrend} />

      {/* Sportsfordeling */}
      <SubHeader text="Sportsfordeling · siste 100 dåder" />
      <SportBreakdown data={dash.sportBreakdown} />

      {/* Totaler */}
      {dash.totals && (
        <>
          <SubHeader text="Husets store regnskap" />
          <TotalsGrid totals={dash.totals} />
        </>
      )}

      {/* Rekorder */}
      <SubHeader text="Bragder & rekorder" />
      <RecordsGrid records={dash.records} />

      {/* Aktiviteter */}
      <SubHeader text="De siste dåder" />
      <ActivitiesPaginated activities={dash.activities} />
    </>
  );
}

function ActivitiesPaginated({ activities }: { activities: DashOk["activities"] }) {
  const PAGE_SIZE = 9;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const slice = activities.slice(start, start + PAGE_SIZE);

  return (
    <>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slice.map((a, idx) => {
          const globalIdx = start + idx + 1;
          const isRun = a.type.toLowerCase().includes("run");
          return (
            <li key={a.id}>
              <article className="panel rounded-lg overflow-hidden glow-on-hover relative h-full flex flex-col">
                <div className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-background/80 border border-primary/40 flex items-center justify-center">
                  <span className="text-medieval text-primary text-xs leading-none">
                    {globalIdx}
                  </span>
                </div>

                {a.polyline ? (
                  <div className="aspect-[16/9] bg-muted">
                    <ActivityMap encoded={a.polyline} />
                  </div>
                ) : (
                  <div className="aspect-[16/9] bg-muted/40 flex items-center justify-center">
                    <span className="text-3xl opacity-30">{activityIcon(a.type)}</span>
                  </div>
                )}

                <div className="p-3 flex flex-col flex-1">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <h3 className="text-sm text-primary text-medieval truncate">
                      {activityIcon(a.type)} {a.name}
                    </h3>
                  </div>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-2 truncate">
                    {formatDate(a.startDate)} · {a.type}
                  </p>

                  <div className="grid grid-cols-2 gap-1.5 text-xs text-foreground/90 mt-auto">
                    <MiniMetric label="Dist" value={formatKm(a.distance)} />
                    <MiniMetric label="Tid" value={formatDuration(a.movingTime)} />
                    <MiniMetric
                      label={isRun ? "Tempo" : "Stigning"}
                      value={
                        isRun
                          ? formatPace(a.distance, a.movingTime)
                          : `${Math.round(a.elevation)} m`
                      }
                    />
                    <MiniMetric
                      label="Puls"
                      value={a.avgHeartrate ? `${Math.round(a.avgHeartrate)}` : "—"}
                    />
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded border border-primary/30 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Forrige
          </button>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-8 h-8 rounded border text-xs text-medieval transition-colors ${
                i === page
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-primary/20 text-muted-foreground hover:text-primary hover:border-primary/50"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-3 py-1.5 rounded border border-primary/30 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Neste →
          </button>
        </div>
      )}
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-primary/15 bg-background/40 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground leading-tight">
        {label}
      </div>
      <div className="text-xs text-primary leading-tight mt-0.5 truncate">{value}</div>
    </div>
  );
}

function SubHeader({ text }: { text: string }) {
  return (
    <div className="ornate-divider mb-6 mt-12">
      <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">{text}</span>
    </div>
  );
}

function WeeklyTrendChart({
  data,
}: {
  data: Array<{ weekStart: string; label: string; distanceKm: number; movingMin: number; elevation: number; count: number }>;
}) {
  const maxKm = useMemo(() => Math.max(1, ...data.map((d) => d.distanceKm)), [data]);
  const maxElev = useMemo(() => Math.max(1, ...data.map((d) => d.elevation)), [data]);

  return (
    <div className="panel rounded-lg p-5 mb-6">
      <div className="grid grid-cols-4 gap-4">
        {data.map((w) => {
          const kmPct = (w.distanceKm / maxKm) * 100;
          const elPct = (w.elevation / maxElev) * 100;
          return (
            <div key={w.weekStart} className="flex flex-col">
              <div className="flex items-end justify-center gap-2 h-40">
                <div className="flex flex-col items-center justify-end h-full w-6">
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${Math.max(2, kmPct)}%` }}
                    title={`${w.distanceKm.toFixed(1)} km`}
                  />
                </div>
                <div className="flex flex-col items-center justify-end h-full w-6">
                  <div
                    className="w-full rounded-t bg-primary/30"
                    style={{ height: `${Math.max(2, elPct)}%` }}
                    title={`${Math.round(w.elevation)} m`}
                  />
                </div>
              </div>
              <div className="mt-2 text-center">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {w.label}
                </div>
                <div className="text-sm text-primary mt-1">{w.distanceKm.toFixed(1)} km</div>
                <div className="text-[10px] text-muted-foreground">
                  {Math.round(w.elevation)} m · {w.count} økter
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-center gap-6 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary/70" /> Distanse
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary/30" /> Stigning
        </span>
      </div>
    </div>
  );
}

function SportBreakdown({
  data,
}: {
  data: Array<{ sport: string; count: number; distance: number; movingTime: number; elevation: number }>;
}) {
  const totalDist = data.reduce((sum, d) => sum + d.distance, 0) || 1;
  return (
    <div className="panel rounded-lg p-5 mb-6">
      <div className="space-y-3">
        {data.map((s) => {
          const pct = (s.distance / totalDist) * 100;
          return (
            <div key={s.sport}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="text-foreground/90">
                  {sportLabel(s.sport)}{" "}
                  <span className="text-muted-foreground text-xs">· {s.count} økter</span>
                </span>
                <span className="text-primary text-medieval">
                  {formatKm(s.distance)}{" "}
                  <span className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase">
                    {pct.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-background/60 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: sportColor(s.sport) }}
                />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {formatDuration(s.movingTime)} · {Math.round(s.elevation)} m stigning
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TotalsGrid({
  totals,
}: {
  totals: NonNullable<DashOk["totals"]>;
}) {
  const block = (label: string, t: TotalBlock | null) => (
    <div className="panel rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      {t ? (
        <>
          <div className="text-2xl text-primary mt-1">{formatKm(t.distance)}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t.count} økter · {formatDuration(t.moving_time)} ·{" "}
            {Math.round(t.elevation_gain)} m
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground mt-2">—</div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 mb-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Siste 4 uker
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {block("Løping", totals.recentRun)}
          {block("Sykling", totals.recentRide)}
          {block("Svømming", totals.recentSwim)}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Hittil i år
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {block("Løping", totals.ytdRun)}
          {block("Sykling", totals.ytdRide)}
          {block("Svømming", totals.ytdSwim)}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Siden tidenes morgen
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {block("Løping totalt", totals.allRun)}
          {block("Sykling totalt", totals.allRide)}
          {block("Svømming totalt", totals.allSwim)}
        </div>
        {(totals.biggestRide || totals.biggestClimb) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {totals.biggestRide && (
              <Stat
                label="Lengste sykkeltur noensinne"
                value={formatKm(totals.biggestRide)}
                hint="rekord"
              />
            )}
            {totals.biggestClimb && (
              <Stat
                label="Største klatring noensinne"
                value={`${Math.round(totals.biggestClimb)} m`}
                hint="rekord"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RecordsGrid({ records }: { records: DashOk["records"] }) {
  const card = (title: string, icon: string, a: SlimAct | null, value: string) => (
    <div className="panel rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {icon} {title}
      </div>
      <div className="text-xl text-primary text-medieval mt-2">{value}</div>
      {a && (
        <div className="text-[11px] text-muted-foreground mt-1 truncate">
          {a.name} · {formatDate(a.startDate)}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {card(
        "Lengste tur",
        "🛡",
        records.longestDistance,
        records.longestDistance ? formatKm(records.longestDistance.distance) : "—",
      )}
      {card(
        "Lengste tid",
        "⌛",
        records.longestTime,
        records.longestTime ? formatDuration(records.longestTime.movingTime) : "—",
      )}
      {card(
        "Mest stigning",
        "⛰",
        records.mostElevation,
        records.mostElevation ? `${Math.round(records.mostElevation.elevation)} m` : "—",
      )}
      {card(
        "Høyeste puls",
        "❤",
        records.maxHr,
        records.maxHr?.maxHeartrate ? `${Math.round(records.maxHr.maxHeartrate)} bpm` : "—",
      )}
      {card(
        "Toppfart",
        "💨",
        records.maxSpeed,
        records.maxSpeed?.maxSpeed ? formatSpeedKmh(records.maxSpeed.maxSpeed) : "—",
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className="text-2xl text-primary mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-primary/20 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1">
        {icon && <span className="text-primary/80">{icon}</span>}
        {label}
      </div>
      <div className="text-base text-primary mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function romanNumeral(n: number) {
  const map: Record<number, string> = {
    1: "I",
    2: "II",
    3: "III",
    4: "IV",
    5: "V",
    6: "VI",
    7: "VII",
    8: "VIII",
    9: "IX",
    10: "X",
  };
  return map[n] ?? String(n);
}

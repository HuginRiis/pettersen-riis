import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PageHero } from "@/components/PageShell";
import { ActivityMap } from "@/components/ActivityMap";
import { getStravaDashboard, getStravaStatus, disconnectStrava } from "@/server/strava";
import treningImg from "@/assets/trening.jpg";

export const Route = createFileRoute("/trening")({
  head: () => ({
    meta: [
      { title: "Treningssalen — Kroppen som rustning | House Riis Pettersen" },
      {
        name: "description",
        content:
          "Husets treningsrutine — Arnes Strava-data, ukens innsats og siste tur på kartet.",
      },
      { property: "og:title", content: "Treningssalen | House Riis Pettersen" },
      { property: "og:description", content: "Styrke, utholdenhet og disiplin." },
      { property: "og:image", content: treningImg },
    ],
  }),
  component: TreningPage,
});

const week = [
  { day: "Mandag", focus: "Styrke", exercises: ["Knebøy 5×5", "Markløft 3×5", "Press 3×8"] },
  { day: "Tirsdag", focus: "Kondisjon", exercises: ["Løpetur 5 km", "Tøying 15 min"] },
  { day: "Onsdag", focus: "Hvile", exercises: ["Lett gåtur", "Mobility"] },
  { day: "Torsdag", focus: "Styrke", exercises: ["Benk 5×5", "Pull-ups 4×8", "Plank 3×60s"] },
  { day: "Fredag", focus: "Intervall", exercises: ["HIIT 20 min", "Core 10 min"] },
  { day: "Lørdag", focus: "Tur", exercises: ["Lang tur i marka", "Fjelltur"] },
  { day: "Søndag", focus: "Restitusjon", exercises: ["Yoga", "Sauna"] },
];

type StatusState =
  | { kind: "loading" }
  | { kind: "disconnected" }
  | { kind: "connected"; athleteName: string | null };

type DashState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      athleteName: string | null;
      week: {
        count: number;
        distanceMeters: number;
        movingSeconds: number;
        elevationMeters: number;
        avgHeartrate: number | null;
      };
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
        polyline: string | null;
      }>;
    };

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
  if (t.includes("ride") || t.includes("cycl")) return "🚴";
  if (t.includes("swim")) return "🏊";
  if (t.includes("hike") || t.includes("walk")) return "🥾";
  if (t.includes("ski")) return "⛷";
  if (t.includes("workout") || t.includes("strength")) return "🏋";
  return "⚔";
}

function TreningPage() {
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [dash, setDash] = useState<DashState>({ kind: "idle" });
  const fetchStatus = useServerFn(getStravaStatus);
  const fetchDash = useServerFn(getStravaDashboard);
  const disconnect = useServerFn(disconnectStrava);

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
        setDash({
          kind: "ok",
          athleteName: res.athleteName,
          week: res.week,
          activities: res.activities,
        });
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

  const lastWithMap =
    dash.kind === "ok" ? dash.activities.find((a) => !!a.polyline) ?? null : null;

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets disiplin"
        title="Treningssalen"
        subtitle="Kroppen er rustning. Disiplin er sverd."
        image={treningImg}
      />

      {/* === Strava-seksjon for Arne === */}
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
            <p className="text-medieval text-lg text-primary mb-2">
              Krøniken er ikke lenket
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Koble Arnes Strava for å vise ukens innsats, siste turer og kart fra marka.
            </p>
            <a
              href="/api/strava/start"
              className="inline-flex items-center gap-2 rounded-md bg-[#FC4C02] px-6 py-3 text-sm font-medium text-white hover:bg-[#e04400] transition-colors"
            >
              Koble til Strava
            </a>
            <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Garmin → Strava synker automatisk
            </p>
          </div>
        )}

        {status.kind === "connected" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-muted-foreground">
                Lenket til{" "}
                <span className="text-primary text-medieval">
                  {dash.kind === "ok" && dash.athleteName ? dash.athleteName : status.athleteName ?? "Arne"}
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

            {dash.kind === "ok" && (
              <>
                {/* Ukens stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
                  <Stat
                    label="Økter denne uka"
                    value={String(dash.week.count)}
                    hint="siden mandag"
                  />
                  <Stat
                    label="Distanse"
                    value={formatKm(dash.week.distanceMeters)}
                    hint="totalt"
                  />
                  <Stat
                    label="Tid i bevegelse"
                    value={formatDuration(dash.week.movingSeconds)}
                    hint="nettotid"
                  />
                  <Stat
                    label="Stigning"
                    value={`${Math.round(dash.week.elevationMeters)} m`}
                    hint={
                      dash.week.avgHeartrate
                        ? `Snittpuls ${dash.week.avgHeartrate} bpm`
                        : "høydemeter"
                    }
                  />
                </div>

                <div className="ornate-divider mb-6">
                  <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
                    De syv siste dåder
                  </span>
                </div>

                {/* Liste over de 7 siste aktivitetene med kart */}
                <ol className="space-y-6">
                  {dash.activities.slice(0, 7).map((a, idx) => (
                    <li key={a.id}>
                      <article className="panel rounded-lg overflow-hidden glow-on-hover relative">
                        {/* Sigil-nummer */}
                        <div className="absolute top-3 left-3 z-10 w-10 h-10 rounded-full bg-background/80 border border-primary/40 flex items-center justify-center">
                          <span className="text-medieval text-primary text-lg leading-none">
                            {romanNumeral(idx + 1)}
                          </span>
                        </div>

                        {/* Kart, eller ornament hvis ingen polyline */}
                        {a.polyline ? (
                          <div className="aspect-[16/7] bg-muted">
                            <ActivityMap encoded={a.polyline} />
                          </div>
                        ) : (
                          <div className="aspect-[16/7] bg-muted/40 flex items-center justify-center">
                            <span className="text-4xl opacity-30">⚔</span>
                          </div>
                        )}

                        <div className="p-5">
                          <div className="flex items-baseline justify-between gap-3 mb-1">
                            <h3 className="text-xl text-primary text-medieval truncate">
                              {activityIcon(a.type)} {a.name}
                            </h3>
                            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground shrink-0">
                              {formatDate(a.startDate)}
                            </span>
                          </div>
                          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-4">
                            {a.type}
                          </p>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-foreground/90">
                            <Metric
                              label="Distanse"
                              value={formatKm(a.distance)}
                              icon="🛡"
                            />
                            <Metric
                              label="Tid"
                              value={formatDuration(a.movingTime)}
                              icon="⌛"
                            />
                            <Metric
                              label={
                                a.type.toLowerCase().includes("run")
                                  ? "Tempo"
                                  : "Stigning"
                              }
                              value={
                                a.type.toLowerCase().includes("run")
                                  ? formatPace(a.distance, a.movingTime)
                                  : `${Math.round(a.elevation)} m`
                              }
                              icon={
                                a.type.toLowerCase().includes("run") ? "🏹" : "⛰"
                              }
                            />
                            <Metric
                              label="Snittpuls"
                              value={
                                a.avgHeartrate
                                  ? `${Math.round(a.avgHeartrate)} bpm`
                                  : "—"
                              }
                              icon="❤"
                              hint={
                                a.maxHeartrate
                                  ? `maks ${Math.round(a.maxHeartrate)}`
                                  : undefined
                              }
                            />
                          </div>
                        </div>
                      </article>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </section>

      {/* === Husets ukeprogram (uendret) === */}
      <section className="container mx-auto px-4 pb-16">
        <div className="ornate-divider mb-8">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Ukens program
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {week.map((d) => (
            <article key={d.day} className="panel rounded-lg p-5 glow-on-hover">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl text-primary">{d.day}</h3>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {d.focus}
                </span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
                {d.exercises.map((e) => (
                  <li key={e} className="flex gap-2">
                    <span className="text-primary">⚔</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          <Quote text="Sverdet sliper seg ikke selv." />
          <Quote text="Vinteren belønner den som forberedte seg om sommeren." />
          <Quote text="En dag uten innsats er en dag tapt." />
        </div>
      </section>
    </PageShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl text-primary mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Quote({ text }: { text: string }) {
  return (
    <div className="panel rounded-lg p-5 text-center">
      <p className="text-medieval text-lg text-primary">"{text}"</p>
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
  };
  return map[n] ?? String(n);
}

// Marker as used to keep import tree-shaken correctly
void Link;

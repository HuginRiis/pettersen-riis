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
                <span className="text-primary">
                  {dash.kind === "ok" && dash.athleteName ? dash.athleteName : status.athleteName ?? "Arne"}
                </span>
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={loadDash}
                  disabled={dash.kind === "loading"}
                  className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary disabled:opacity-50"
                >
                  ↻ Oppfrisk
                </button>
                <button
                  onClick={async () => {
                    await disconnect();
                    await loadStatus();
                  }}
                  className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive"
                >
                  Koble fra
                </button>
              </div>
            </div>

            {dash.kind === "loading" && (
              <p className="text-center text-sm text-muted-foreground">Henter ukens dåder…</p>
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
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
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

                {/* Kart over siste tur */}
                {lastWithMap && lastWithMap.polyline && (
                  <article className="panel rounded-lg overflow-hidden mb-8">
                    <div className="flex items-baseline justify-between p-4">
                      <div>
                        <h3 className="text-lg text-primary">
                          {activityIcon(lastWithMap.type)} {lastWithMap.name}
                        </h3>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-1">
                          {formatDate(lastWithMap.startDate)} ·{" "}
                          {formatKm(lastWithMap.distance)} ·{" "}
                          {formatDuration(lastWithMap.movingTime)}
                        </p>
                      </div>
                    </div>
                    <div className="aspect-video bg-muted">
                      <ActivityMap encoded={lastWithMap.polyline} />
                    </div>
                  </article>
                )}

                {/* Liste over aktiviteter */}
                <div className="grid sm:grid-cols-2 gap-3">
                  {dash.activities.map((a) => (
                    <article key={a.id} className="panel rounded-lg p-4 glow-on-hover">
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="text-base text-primary truncate">
                          {activityIcon(a.type)} {a.name}
                        </h4>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                          {formatDate(a.startDate)}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-foreground/90">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Distanse
                          </div>
                          <div>{formatKm(a.distance)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Tid
                          </div>
                          <div>{formatDuration(a.movingTime)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {a.type.toLowerCase().includes("run") ? "Tempo" : "Stigning"}
                          </div>
                          <div>
                            {a.type.toLowerCase().includes("run")
                              ? formatPace(a.distance, a.movingTime)
                              : `${Math.round(a.elevation)} m`}
                          </div>
                        </div>
                      </div>
                      {a.avgHeartrate && (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          ❤ Snittpuls {Math.round(a.avgHeartrate)} bpm
                          {a.maxHeartrate ? ` · maks ${Math.round(a.maxHeartrate)}` : ""}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
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

// Marker as used to keep import tree-shaken correctly
void Link;

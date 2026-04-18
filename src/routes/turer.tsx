import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Loader2, Mountain, Bike, Car, Footprints, Compass } from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { TripDetailDialog } from "@/components/TripDetailDialog";
import { getTripSuggestions, reverseGeocode, type TripSuggestion } from "@/server/turer";
import turerImg from "@/assets/turer.jpg";

export const Route = createFileRoute("/turer")({
  head: () => ({
    meta: [
      { title: "Ferden — Turforslag i Norge | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Få personlige turforslag i Norge — fotturer, toppturer, sykkelturer og bilturer i ditt nærområde, fortalt av Mesteren.",
      },
      { property: "og:title", content: "Ferden — Turforslag | House Pettersen Riis" },
      {
        property: "og:description",
        content: "La Mesteren peke ut neste ferd — uansett om du går, sykler eller rir jernhesten.",
      },
      { property: "og:image", content: turerImg },
    ],
  }),
  errorComponent: ({ error }) => (
    <PageShell>
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-2xl text-primary mb-2">Mesteren tier</h1>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    </PageShell>
  ),
  component: TurerPage,
});

type Category = "fottur" | "topptur" | "sykkel" | "bil";

const categories: Array<{
  key: Category;
  label: string;
  blurb: string;
  Icon: typeof Footprints;
}> = [
  { key: "fottur", label: "Fottur", blurb: "Til fots i marka", Icon: Footprints },
  { key: "topptur", label: "Topptur", blurb: "Mot fjellets krone", Icon: Mountain },
  { key: "sykkel", label: "Sykkel", blurb: "På to hjul", Icon: Bike },
  { key: "bil", label: "Bil", blurb: "Med jernhesten", Icon: Car },
];

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; suggestions: TripSuggestion[]; locationLabel: string; category: Category };

function TurerPage() {
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<Category>("fottur");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [gpsLoading, setGpsLoading] = useState(false);

  const fetchSuggestions = useServerFn(getTripSuggestions);
  const reverse = useServerFn(reverseGeocode);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const loc = location.trim();
    if (loc.length < 2) {
      setState({ kind: "error", message: "Skriv inn et sted (minst 2 tegn)." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetchSuggestions({ data: { location: loc, category } });
      if (!res.ok) {
        setState({ kind: "error", message: res.error });
        return;
      }
      setState({
        kind: "ok",
        suggestions: res.suggestions,
        locationLabel: res.locationLabel,
        category,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Ukjent feil.",
      });
    }
  };

  const useGps = () => {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "Nettleseren støtter ikke posisjon." });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await reverse({
            data: { lat: pos.coords.latitude, lon: pos.coords.longitude },
          });
          if (r.ok) {
            setLocation(r.label);
          } else {
            setState({ kind: "error", message: r.error });
          }
        } catch (e) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Stedsoppslag feilet.",
          });
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        setGpsLoading(false);
        setState({
          kind: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "Du nektet tilgang til posisjon."
              : "Kunne ikke hente posisjon.",
        });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 },
    );
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Mesterens kart"
        title="Ferden"
        subtitle="La Mesteren peke ut neste tur — fotturer, toppturer, sykkel- eller bilturer i ditt rike."
        image={turerImg}
      />

      <section className="container mx-auto px-4 py-10 max-w-5xl">
        <article className="panel rounded-lg p-6 mb-8">
          <h2 className="text-xl text-primary mb-4 flex items-center gap-2">
            <Compass size={20} /> Hvor skal ferden gå?
          </h2>
          <form onSubmit={onSearch} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <MapPin
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="F.eks. Skien, Geilo, Lofoten..."
                  maxLength={120}
                  className="w-full pl-9 pr-3 py-2.5 rounded-md bg-background/60 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <button
                type="button"
                onClick={useGps}
                disabled={gpsLoading}
                className="px-4 py-2.5 rounded-md border border-border bg-background/40 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                title="Bruk min posisjon"
              >
                {gpsLoading ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                Min posisjon
              </button>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Velg ferdens art
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {categories.map((c) => {
                  const active = category === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setCategory(c.key)}
                      className={[
                        "rounded-md border px-3 py-3 text-left transition-all",
                        active
                          ? "border-primary/70 bg-primary/10 shadow-[0_0_18px_-6px_var(--color-primary)]"
                          : "border-border bg-background/40 hover:border-primary/40",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      <c.Icon
                        size={18}
                        className={active ? "text-primary mb-1.5" : "text-muted-foreground mb-1.5"}
                      />
                      <div
                        className={
                          active
                            ? "text-sm text-primary font-semibold"
                            : "text-sm text-foreground"
                        }
                      >
                        {c.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{c.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={state.kind === "loading"}
              className="w-full sm:w-auto px-6 py-2.5 rounded-md bg-primary text-primary-foreground tracking-wider uppercase text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {state.kind === "loading" ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Mesteren rådfører kartet...
                </>
              ) : (
                <>Spør Mesteren</>
              )}
            </button>
          </form>
        </article>

        {state.kind === "error" && (
          <div className="panel rounded-lg p-4 border-destructive/40">
            <p className="text-sm text-destructive">{state.message}</p>
          </div>
        )}

        {state.kind === "loading" && (
          <div className="panel rounded-lg p-8 text-center">
            <Loader2 className="animate-spin mx-auto text-primary mb-3" size={28} />
            <p className="text-sm text-muted-foreground italic">
              Sender ravn til Mesteren...
            </p>
          </div>
        )}

        {state.kind === "ok" && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-2xl text-primary">
                Ferder fra <span className="italic">{state.locationLabel}</span>
              </h2>
              <span className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                {state.suggestions.length} forslag · {labelForCategory(state.category)}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {state.suggestions.map((s, i) => (
                <TripCard key={`${s.name}-${i}`} trip={s} />
              ))}
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function labelForCategory(c: Category) {
  return categories.find((x) => x.key === c)?.label ?? c;
}

function TripCard({ trip }: { trip: TripSuggestion }) {
  const diffColor =
    trip.difficulty === "Lett"
      ? "text-emerald-400 border-emerald-400/40"
      : trip.difficulty === "Middels"
        ? "text-amber-400 border-amber-400/40"
        : "text-rose-400 border-rose-400/40";

  return (
    <article className="panel rounded-lg p-5 glow-on-hover h-full flex flex-col">
      <header className="mb-2">
        <h3 className="text-lg text-primary leading-tight">{trip.name}</h3>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
          {trip.area}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
        <span className={`px-2 py-0.5 rounded border ${diffColor} uppercase tracking-wider`}>
          {trip.difficulty}
        </span>
        <span className="px-2 py-0.5 rounded border border-border text-muted-foreground">
          ⏱ {trip.duration}
        </span>
        {trip.distanceKm !== null && (
          <span className="px-2 py-0.5 rounded border border-border text-muted-foreground">
            {trip.distanceKm.toFixed(1)} km
          </span>
        )}
      </div>

      <p className="text-sm text-foreground/85 mb-3 flex-1">{trip.description}</p>

      {trip.highlights.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1 mb-3">
          {trip.highlights.map((h, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary">❦</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-auto">
        <span className="uppercase tracking-wider text-primary/80">Start: </span>
        {trip.startHint}
      </div>
    </article>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ExternalLink, Users, Monitor, Star } from "lucide-react";
import { searchSteamGames, type SteamGame } from "@/lib/steam-search.functions";

const TYPE_FILTERS: { id: string; label: string; genres: string[] }[] = [
  { id: "racing", label: "Bilspill", genres: ["Racing"] },
  { id: "sim", label: "Simulator", genres: ["Simulation"] },
  { id: "shooter", label: "Skytespill", genres: ["Action", "Free to Play"] },
  { id: "strategy", label: "Strategi", genres: ["Strategy"] },
  { id: "sport", label: "Sport", genres: ["Sports"] },
  { id: "rpg", label: "Rollespill", genres: ["RPG"] },
  { id: "adventure", label: "Eventyr", genres: ["Adventure"] },
  { id: "indie", label: "Indie", genres: ["Indie", "Casual"] },
];

export function SteamSearch() {
  const runSearch = useServerFn(searchSteamGames);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<SteamGame[] | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [coopOnly, setCoopOnly] = useState(false);
  const [windowsOnly, setWindowsOnly] = useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (term.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runSearch({ data: { term: term.trim() } });
      setGames(res.games);
      if (res.error) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Søket feilet");
    } finally {
      setLoading(false);
    }
  };

  const toggleType = (id: string) =>
    setTypes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const activeGenres = TYPE_FILTERS.filter((t) => types.includes(t.id)).flatMap((t) => t.genres);

  const filtered = (games ?? []).filter((g) => {
    if (windowsOnly && !g.windows) return false;
    if (coopOnly && !(g.coop || g.lan)) return false;
    if (activeGenres.length > 0 && !g.genres.some((x) => activeGenres.includes(x))) return false;
    return true;
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Search size={18} className="text-primary" /> Søk i hele Steam-katalogen
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Søker direkte i Steam sitt katalog-API — alle Windows-spill gjennom tidene. Filtrer på type
          spill og co-op.
        </p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="F.eks. rally, tank, zombie, golf…"
            className="pl-9"
            aria-label="Søk i Steam"
          />
        </div>
        <Button type="submit" disabled={loading || term.trim().length < 2} className="gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Søk
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((t) => {
          const on = types.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleType(t.id)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                on
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCoopOnly((v) => !v)}
          aria-pressed={coopOnly}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            coopOnly
              ? "bg-emerald-500 text-background border-emerald-500"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Kun co-op / LAN
        </button>
        <button
          type="button"
          onClick={() => setWindowsOnly((v) => !v)}
          aria-pressed={windowsOnly}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            windowsOnly
              ? "bg-sky-500 text-background border-sky-500"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Kun Windows
        </button>
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      {games && (
        <div className="text-xs text-muted-foreground">
          {filtered.length} treff{games.length !== filtered.length ? ` (av ${games.length})` : ""}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((g) => (
          <a
            key={g.appid}
            href={g.url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-lg border border-border bg-background/60 transition-all hover:-translate-y-0.5 hover:border-primary/50"
          >
            {g.image && (
              <img
                src={g.image}
                alt={`Omslagsbilde for ${g.name}`}
                loading="lazy"
                className="h-28 w-full object-cover"
              />
            )}
            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-foreground">{g.name}</div>
                <ExternalLink size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {g.releaseYear && <span>{g.releaseYear}</span>}
                {g.price && <span className="text-foreground/80">{g.price}</span>}
                {g.metascore && (
                  <span className="inline-flex items-center gap-0.5 text-amber-400">
                    <Star size={11} /> {g.metascore}
                  </span>
                )}
                {g.windows && (
                  <span className="inline-flex items-center gap-0.5">
                    <Monitor size={11} /> Windows
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {g.lan && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                    LAN
                  </span>
                )}
                {g.coop && (
                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-400">
                    Co-op
                  </span>
                )}
                {g.multiplayer && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/80">
                    <Users size={10} /> Flerspiller
                  </span>
                )}
                {g.genres.slice(0, 3).map((x) => (
                  <span
                    key={x}
                    className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {x}
                  </span>
                ))}
              </div>
            </div>
          </a>
        ))}
      </div>

      {games && filtered.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Ingen treff med disse filtrene. Prøv et annet søkeord eller færre filtre.
        </div>
      )}
    </section>
  );
}

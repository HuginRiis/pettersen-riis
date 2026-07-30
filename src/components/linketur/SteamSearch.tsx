import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Loader2,
  ExternalLink,
  Users,
  Monitor,
  Star,
  Sparkles,
} from "lucide-react";
import { aiSteamSearch, type SteamGame } from "@/lib/steam-search.functions";

const TYPE_FILTERS: { id: string; label: string }[] = [
  { id: "racing", label: "Bilspill" },
  { id: "sim", label: "Simulator" },
  { id: "shooter", label: "Skytespill" },
  { id: "strategy", label: "Strategi" },
  { id: "sport", label: "Sport" },
  { id: "rpg", label: "Rollespill" },
  { id: "adventure", label: "Eventyr" },
  { id: "indie", label: "Indie" },
];

export function SteamSearch() {
  const runSearch = useServerFn(aiSteamSearch);
  const [term, setTerm] = useState("");
  const [players, setPlayers] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<SteamGame[] | null>(null);
  const [summary, setSummary] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [coopOnly, setCoopOnly] = useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (term.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runSearch({
        data: { query: term.trim(), players, categories: types, coopOnly },
      });
      setGames(res.games);
      setSummary(res.summary ?? "");
      setTerms(res.terms ?? []);
      if (res.error) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Søket feilet");
    } finally {
      setLoading(false);
    }
  };

  const toggleType = (id: string) =>
    setTypes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <section className="rounded-xl border border-primary/40 bg-card p-5 space-y-4">
      <div>
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Sparkles size={18} className="text-primary" /> AI-søk i Steam
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Skriv hva dere har lyst på — AI-en oversetter det til gode Steam-søk, finner spill som
          funker på Windows, og anslår hvor mange som kan spille.
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
            placeholder="F.eks. «kaotisk bilspill vi kan spille åtte stykker»"
            className="pl-9"
            aria-label="AI-søk i Steam"
          />
        </div>
        <Button type="submit" disabled={loading || term.trim().length < 2} className="gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Søk
        </Button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="inline-flex items-center gap-1.5">
              <Users size={13} /> Antall spillere
            </span>
            <span className="text-foreground font-medium">{players}</span>
          </div>
          <input
            type="range"
            min={1}
            max={32}
            value={players}
            onChange={(e) => setPlayers(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Antall spillere i Steam-søket"
          />
        </div>
        <div className="flex flex-wrap items-start gap-2">
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
            Kun flerspiller / co-op
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      {summary && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/90">
          <span className="text-primary">AI:</span> {summary}
          {terms.length > 0 && (
            <span className="ml-2 text-muted-foreground">
              (søkte på: {terms.join(", ")})
            </span>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(games ?? []).map((g) => (
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
              {g.aiNote && <p className="text-[11px] text-primary">{g.aiNote}</p>}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {g.playersLabel && (
                  <span className="inline-flex items-center gap-0.5 text-foreground/90">
                    <Users size={11} /> {g.playersLabel}
                  </span>
                )}
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

      {games && games.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Ingen treff. Prøv å beskrive det litt annerledes eller skru av filtrene.
        </div>
      )}
    </section>
  );
}

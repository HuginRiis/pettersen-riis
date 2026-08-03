import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, ExternalLink, RefreshCw, Users } from "lucide-react";
import { newestLanGames, type SteamGame } from "@/lib/steam-search.functions";
import { usePersistedState } from "@/hooks/use-persisted-state";

type Cache = { day: string; fetchedAt: string; games: SteamGame[] } | null;

const dayKey = () => new Date().toISOString().slice(0, 10);

export function NewestLanGames() {
  const fetchNewest = useServerFn(newestLanGames);
  const [cache, setCache] = usePersistedState<Cache>("linketur:newest-lan", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNewest({});
      setCache({ day: dayKey(), fetchedAt: res.fetchedAt, games: res.games });
    } catch {
      setError("Klarte ikke hente nye spill akkurat nå.");
    } finally {
      setLoading(false);
    }
  };

  // Automatisk oppslag én gang i døgnet
  useEffect(() => {
    if (loading) return;
    if (cache?.day === dayKey() && cache.games.length > 0) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache?.day]);

  const games = cache?.games ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Sparkles size={18} className="text-primary" /> 20 nyeste LAN-forslag
        </h2>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {cache?.fetchedAt && (
            <span>
              Oppdatert {new Date(cache.fetchedAt).toLocaleString("nb-NO", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Oppdater
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Hentes automatisk fra Steam én gang i døgnet — nye slipp som funker med flere spillere.
      </p>

      {error && <div className="text-xs text-destructive">{error}</div>}

      {games.length === 0 && loading && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Loader2 size={16} className="mx-auto mb-2 animate-spin" /> Henter nye spill…
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => (
          <a
            key={g.appid}
            href={g.url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50"
          >
            {g.image && (
              <img
                src={g.image}
                alt={g.name}
                loading="lazy"
                className="h-28 w-full object-cover"
              />
            )}
            <div className="space-y-1.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-foreground">{g.name}</div>
                <ExternalLink size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                {g.lan && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">LAN</span>
                )}
                {g.coop && (
                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-400">Co-op</span>
                )}
                {g.multiplayer && (
                  <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                    <Users size={10} /> Flerspiller
                  </span>
                )}
                {g.releaseYear && (
                  <span className="text-muted-foreground">{g.releaseYear}</span>
                )}
                {g.price && <span className="text-muted-foreground">{g.price}</span>}
              </div>
              {g.genres.length > 0 && (
                <div className="truncate text-[11px] text-muted-foreground">
                  {g.genres.slice(0, 3).join(" · ")}
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

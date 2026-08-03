import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Gamepad2,
  Search,
  Users,
  Wrench,
  Map as MapIcon,
  Dices,
  Flame,
  Network,
  Sparkles,
} from "lucide-react";
import heroImg from "@/assets/got-linketur.jpg";
import { SteamSearch } from "@/components/linketur/SteamSearch";
import { LinketurCrew } from "@/components/linketur/LinketurCrew";
import { NewestLanGames } from "@/components/linketur/NewestLanGames";

import {
  LAN_GAMES,
  LAN_MODE_LABEL,
  LAN_MODE_COLOR,
  LAN_TOOLS,
  ALL_GENRES,
  type LanGame,
  type LanMode,
} from "@/lib/lan-games";

export const Route = createFileRoute("/linketur")({
  head: () => ({
    meta: [
      { title: "Linketur — LAN-spill, mods og maps | House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Søk etter spill som funker på LAN for akkurat så mange spillere dere er. Se mods, hacks, oppsett og anbefalte maps — og få tilfeldige forslag til neste runde.",
      },
      { property: "og:title", content: "Linketur — LAN-spill, mods og maps" },
      {
        property: "og:description",
        content:
          "Finn LAN-spill etter antall spillere, sjanger og oppsett. Med mods, hacks og map-forslag.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LinketurRoute,
});

const MODES: LanMode[] = ["ekte-lan", "vpn", "server", "online"];

function LinketurRoute() {
  const [q, setQ] = useState("");
  const [players, setPlayers] = useState(4);
  const [genre, setGenre] = useState<string>("alle");
  const [modes, setModes] = useState<LanMode[]>([]);
  const [modsOnly, setModsOnly] = useState(false);
  const [pick, setPick] = useState<{ game: LanGame; map: string; mod: string } | null>(null);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return LAN_GAMES.filter((g) => {
      if (g.minPlayers > players || g.maxPlayers < players) return false;
      if (genre !== "alle" && g.genre !== genre) return false;
      if (modes.length > 0 && !modes.includes(g.mode)) return false;
      if (modsOnly && g.mods.length === 0) return false;
      if (!needle) return true;
      const hay = [g.title, g.genre, g.setup, ...g.mods, ...g.maps, ...g.tags]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    }).sort((a, b) => b.chaos - a.chaos || a.title.localeCompare(b.title));
  }, [q, players, genre, modes, modsOnly]);

  const toggleMode = (m: LanMode) =>
    setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const rollSuggestion = () => {
    const pool = results.length > 0 ? results : LAN_GAMES;
    const game = pool[Math.floor(Math.random() * pool.length)];
    setPick({
      game,
      map: game.maps[Math.floor(Math.random() * game.maps.length)] ?? "Fritt valg",
      mod: game.mods[Math.floor(Math.random() * game.mods.length)] ?? "Vanilla",
    });
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Linketur"
        title="Linketur"
        subtitle="Finn spillet som funker for akkurat så mange dere er — med mods, hacks, oppsett og maps."
        image={heroImg}
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={rollSuggestion} className="gap-2">
            <Dices size={16} /> Gi meg et forslag
          </Button>
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
            <Gamepad2 size={14} className="text-primary" /> {LAN_GAMES.length} spill i katalogen
          </div>
        </div>
      </PageHero>

      <div className="container mx-auto px-4 py-8 space-y-8">
        <LinketurCrew />

        <NewestLanGames />

        <SteamSearch />


        {pick && (
          <section className="relative overflow-hidden rounded-xl border border-primary/40 bg-card p-5">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
            <div className="relative space-y-3">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
                <Sparkles size={14} /> Kveldens forslag
              </div>
              <h2 className="text-2xl md:text-3xl text-foreground">{pick.game.title}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <InfoBox icon={<MapIcon size={14} />} label="Map / modus" value={pick.map} />
                <InfoBox icon={<Wrench size={14} />} label="Mod å prøve" value={pick.mod} />
                <InfoBox
                  icon={<Users size={14} />}
                  label="Spillere"
                  value={`${pick.game.minPlayers}–${pick.game.maxPlayers}`}
                />
              </div>
              <p className="text-sm text-muted-foreground">{pick.game.setup}</p>
              <Button size="sm" variant="secondary" onClick={rollSuggestion} className="gap-2">
                <Dices size={14} /> Trill på nytt
              </Button>
            </div>
          </section>
        )}

        {/* Filtre */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søk etter spill, mod, map eller sjanger…"
              className="pl-9"
              aria-label="Søk etter LAN-spill"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
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
                aria-label="Antall spillere"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>1</span>
                <span>32</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-2">Sjanger</div>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                aria-label="Sjanger"
              >
                <option value="alle">Alle sjangre</option>
                {ALL_GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Network size={13} /> Oppsett:
            </span>
            {MODES.map((m) => {
              const on = modes.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => toggleMode(m)}
                  className="rounded-full border px-3 py-1 text-xs transition-colors"
                  style={{
                    borderColor: LAN_MODE_COLOR[m],
                    color: on ? "#0b0b0b" : LAN_MODE_COLOR[m],
                    backgroundColor: on ? LAN_MODE_COLOR[m] : "transparent",
                  }}
                  aria-pressed={on}
                >
                  {LAN_MODE_LABEL[m]}
                </button>
              );
            })}
            <button
              onClick={() => setModsOnly((v) => !v)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                modsOnly
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground"
              }`}
              aria-pressed={modsOnly}
            >
              Kun med mods/hacks
            </button>
          </div>

          <div className="text-xs text-muted-foreground">
            {results.length} spill passer for {players} spiller{players === 1 ? "" : "e"}.
          </div>
        </section>

        {/* Resultater */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
          {results.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Ingen treff. Prøv færre filtre eller et annet antall spillere.
            </div>
          )}
        </section>






        {/* Verktøykasse */}
        <section className="space-y-3">
          <h2 className="text-xl text-foreground inline-flex items-center gap-2">
            <Wrench size={18} className="text-primary" /> Verktøykassa for LAN & hacks
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LAN_TOOLS.map((t) => (
              <div key={t.name} className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm font-medium text-foreground">{t.name}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t.what}</p>
                <p className="mt-2 text-[11px] text-primary">{t.best}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function InfoBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

function GameCard({ game }: { game: LanGame }) {
  const color = LAN_MODE_COLOR[game.mode];
  return (
    <article className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50">
      <div
        className="absolute inset-x-0 top-0 h-0.5 opacity-70"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base text-foreground">{game.title}</h3>
          <div className="text-xs text-muted-foreground">{game.genre}</div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {LAN_MODE_LABEL[game.mode]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users size={12} /> {game.minPlayers}–{game.maxPlayers}
        </span>
        <span className="inline-flex items-center gap-0.5" title={`Kaos-faktor ${game.chaos}/5`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Flame
              key={i}
              size={12}
              className={i < game.chaos ? "text-orange-400" : "text-muted-foreground/30"}
            />
          ))}
        </span>
        {game.free && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
            Gratis
          </span>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{game.setup}</p>

      <div className="mt-3 space-y-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <Wrench size={11} /> Mods & hacks
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {game.mods.map((m) => (
              <span
                key={m}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground/80"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <MapIcon size={11} /> Maps / moduser
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {game.maps.map((m) => (
              <span
                key={m}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/80"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

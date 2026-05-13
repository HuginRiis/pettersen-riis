import { useMenuPrefs } from "@/hooks/use-menu-prefs";
import { Star, ListOrdered } from "lucide-react";

const ALL_LINKS: { to: string; label: string }[] = [
  { to: "/var", label: "Vær" },
  { to: "/pollen", label: "Pollen" },
  { to: "/turer", label: "Ferden" },
  { to: "/got-saga", label: "Westeros" },
  { to: "/agenda", label: "Søppel, bursdager og meldinger" },
  { to: "/push-varslinger", label: "Varslinger" },
  { to: "/vakttarnet", label: "Vakttårnet" },
  { to: "/hytta", label: "Hytta" },
  { to: "/smarthus", label: "Smartborg" },
  { to: "/lys", label: "Lys" },
  { to: "/stromkroniken", label: "Strømkrøniken" },
  { to: "/oppussing-borgen", label: "Prosjekter på Borgen" },
  { to: "/oppussing-hytta", label: "Prosjekter på hytta" },
  { to: "/matvarer", label: "Varer" },
  { to: "/kvitteringer", label: "Kvitteringer" },
  { to: "/hundene", label: "Hundene" },
  { to: "/trening", label: "Trening" },
  { to: "/varsler", label: "Farevarsler" },
];

export function MenuPreferencesPanel() {
  const { prefs, setSortByUsage, setFavoritesEnabled, toggleFavorite } = useMenuPrefs();

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <ListOrdered size={18} className="text-primary" /> Meny-innstillinger
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Velg hvordan menyen sorteres og hvilke sider som vises som favoritter.
        </p>

        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer panel rounded p-3 border border-border/50">
            <input
              type="checkbox"
              checked={prefs.sortByUsage}
              onChange={(e) => setSortByUsage(e.target.checked)}
              className="accent-primary"
            />
            <span>Sorter mest brukte øverst</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer panel rounded p-3 border border-border/50">
            <input
              type="checkbox"
              checked={prefs.favoritesEnabled}
              onChange={(e) => setFavoritesEnabled(e.target.checked)}
              className="accent-primary"
            />
            <span>Vis favoritter øverst</span>
          </label>
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Star size={12} /> Favoritter
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_LINKS.map((l) => {
              const isFav = prefs.favorites.includes(l.to);
              return (
                <button
                  key={l.to}
                  type="button"
                  onClick={() => toggleFavorite(l.to)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition flex items-center gap-1 ${
                    isFav
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-accent/40"
                  }`}
                >
                  <Star size={11} fill={isFav ? "currentColor" : "none"} />
                  {l.label}
                </button>
              );
            })}
          </div>
          {!prefs.favoritesEnabled && (
            <p className="text-[11px] text-muted-foreground mt-2 italic">
              Favoritter er for øyeblikket skrudd av — skru på over for å vise dem i menyen.
            </p>
          )}
        </div>
      </article>
    </section>
  );
}

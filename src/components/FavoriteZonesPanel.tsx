import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star, ArrowUp, ArrowDown, Home } from "lucide-react";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";
import { getHomeySnapshot, type HomeyDeviceSnapshot } from "@/lib/homey.functions";

const EXTRA_LIGHT_NAME_TOKENS: string[][] = [["garsej", "lys"], ["stålampe"]];

function isLightLike(d: HomeyDeviceSnapshot): boolean {
  if (d.class === "light") return true;
  if ("dim" in d.capabilities) return true;
  const nm = (d.name ?? "").toLowerCase();
  const hasOn = "onoff" in d.capabilities;
  if (hasOn && EXTRA_LIGHT_NAME_TOKENS.some((toks) => toks.every((t) => nm.includes(t)))) return true;
  return false;
}

export function FavoriteZonesPanel() {
  const { prefs, toggleFavoriteZone, moveFavoriteZone } = useMenuPrefs();
  const fetchSnap = useServerFn(getHomeySnapshot);
  const [zones, setZones] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await fetchSnap();
        if (cancelled || !snap.ok) return;
        const zoneById = new Map(snap.zones.map((z) => [z.id, z.name]));
        const set = new Set<string>();
        for (const d of snap.devices as HomeyDeviceSnapshot[]) {
          if (!isLightLike(d)) continue;
          const name = d.zone ? zoneById.get(d.zone) ?? "Ukjent sal" : "Ukjent sal";
          set.add(name);
        }
        setZones(Array.from(set).sort((a, b) => a.localeCompare(b, "nb")));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [fetchSnap]);

  const favs = prefs.favoriteZones;
  const nonFavs = useMemo(
    () => zones.filter((z) => !favs.includes(z)),
    [zones, favs],
  );

  return (
    <section className="pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <Home size={18} className="text-primary" /> Favoritt-rom på Lys-siden
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Velg hvilke saler/rom som skal vises øverst på Lys-siden. Endre rekkefølge med pilene.
        </p>

        <div className="mt-3">
          <p className="text-[10px] tracking-[0.25em] uppercase text-primary mb-1">
            Favoritter (vises i denne rekkefølgen)
          </p>
          {favs.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">Ingen favoritter valgt ennå.</div>
          ) : (
            <ul className="space-y-1">
              {favs.map((z, i) => (
                <li
                  key={z}
                  className="flex items-center gap-2 px-2 py-1.5 rounded border border-primary/40 bg-primary/5"
                >
                  <Star size={12} className="text-primary fill-current" />
                  <span className="flex-1 text-sm truncate">{z}</span>
                  <button
                    type="button"
                    onClick={() => moveFavoriteZone(z, -1)}
                    disabled={i === 0}
                    className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"
                    aria-label="Flytt opp"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveFavoriteZone(z, 1)}
                    disabled={i === favs.length - 1}
                    className="p-1 text-muted-foreground hover:text-primary disabled:opacity-30"
                    aria-label="Flytt ned"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavoriteZone(z)}
                    className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive px-2"
                  >
                    Fjern
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {nonFavs.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1">
              Andre rom
            </p>
            <div className="flex flex-wrap gap-1.5">
              {nonFavs.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => toggleFavoriteZone(z)}
                  className="px-2.5 py-1 rounded-full text-xs border border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground flex items-center gap-1"
                >
                  <Star size={11} /> {z}
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

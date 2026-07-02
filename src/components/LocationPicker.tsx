import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Star, MapPin } from "lucide-react";
import { getStoredWho } from "@/lib/push-client";
import {
  reverseGeocode,
  searchPlaces,
  setDefaultLocation,
  type PlaceHit,
  type WhoName,
  type LocationPage,
} from "@/lib/user-locations.functions";

export type ActiveLocation = {
  label: string;
  lat: number;
  lon: number;
};

type Props = {
  page: LocationPage;
  who: WhoName;
  onWhoChange: (who: WhoName) => void;
  active: ActiveLocation;
  defaultLabel: string;
  onChange: (loc: ActiveLocation) => void;
  onDefaultSaved?: (loc: ActiveLocation) => void;
  authenticated?: boolean;
  readOnlyWho?: boolean;
  /** Når true: ingen egen bakgrunn/border (containeren utenfor styrer flis-stilen). */
  transparent?: boolean;
  /** Når true: skjul 📍-knapp og "Sett som standard"-knapp. */
  hideActions?: boolean;
  /** Overskrift/etikett som vises øverst i boksen. */
  title?: string;
};

const MAX_RECENT = 3;
const MAX_FAV = 12;

function lsRead(key: string): ActiveLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.label === "string") : [];
  } catch {
    return [];
  }
}
function lsWrite(key: string, list: ActiveLocation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch { /* ignore */ }
}
function sameLoc(a: ActiveLocation, b: ActiveLocation) {
  return a.label.trim().toLowerCase() === b.label.trim().toLowerCase();
}

export function LocationPicker({
  page,
  who,
  active,
  defaultLabel,
  onChange,
  onDefaultSaved,
  authenticated = false,
  transparent = false,
  hideActions = false,
}: Props) {
  const search = useServerFn(searchPlaces);
  const saveDefault = useServerFn(setDefaultLocation);
  
  const reverse = useServerFn(reverseGeocode);

  const FAV_KEY = `loc:fav:${page}`;
  const RECENT_KEY = `loc:recent:${page}`;

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<ActiveLocation[]>([]);
  const [recents, setRecents] = useState<ActiveLocation[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [pushWho, setPushWho] = useState<string>("Alle");

  useEffect(() => {
    setPushWho(getStoredWho());
    const onStorage = () => setPushWho(getStoredWho());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    setFavorites(lsRead(FAV_KEY));
    setRecents(lsRead(RECENT_KEY));
  }, [FAV_KEY, RECENT_KEY]);

  const isFavorite = useMemo(
    () => favorites.some((f) => sameLoc(f, active)),
    [favorites, active],
  );

  // Debounced search
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await search({ data: { q: query.trim() } });
        setHits(r.hits);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  }, [query, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrap.current) return;
      if (!wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pushRecent = (loc: ActiveLocation) => {
    setRecents((prev) => {
      const next = [loc, ...prev.filter((r) => !sameLoc(r, loc))].slice(0, MAX_RECENT);
      lsWrite(RECENT_KEY, next);
      return next;
    });
  };

  const handlePick = (h: PlaceHit) => {
    const loc = { label: h.label, lat: h.lat, lon: h.lon };
    onChange(loc);
    pushRecent(loc);
    setQuery("");
    setHits(null);
    setOpen(false);
  };

  const handlePickStored = (loc: ActiveLocation) => {
    onChange(loc);
    pushRecent(loc);
  };

  const toggleFavorite = () => {
    setFavorites((prev) => {
      const exists = prev.some((f) => sameLoc(f, active));
      const next = exists
        ? prev.filter((f) => !sameLoc(f, active))
        : [active, ...prev].slice(0, MAX_FAV);
      lsWrite(FAV_KEY, next);
      try { window.dispatchEvent(new CustomEvent("loc-favs-changed", { detail: { page } })); } catch { /* ignore */ }
      return next;
    });
  };

  const removeFavorite = (loc: ActiveLocation) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => !sameLoc(f, loc));
      lsWrite(FAV_KEY, next);
      try { window.dispatchEvent(new CustomEvent("loc-favs-changed", { detail: { page } })); } catch { /* ignore */ }
      return next;
    });
  };

  const handleSetDefault = async () => {
    setSavingDefault(true);
    try {
      await saveDefault({
        data: {
          who,
          page,
          place_label: active.label,
          lat: active.lat,
          lon: active.lon,
        },
      });
      setSavedFlash(true);
      onDefaultSaved?.(active);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch { /* ignore */ }
    finally {
      setSavingDefault(false);
    }
  };

  const handleLocate = () => {
    setLocateError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError("Nettleseren støtter ikke posisjonering.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          const r = await reverse({ data: { lat, lon } });
          const loc = { label: r.label, lat: r.lat, lon: r.lon };
          onChange(loc);
          pushRecent(loc);
        } catch {
          onChange({ label: `${lat.toFixed(4)}°N ${lon.toFixed(4)}°Ø`, lat, lon });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) setLocateError("Posisjon avslått.");
        else if (err.code === err.POSITION_UNAVAILABLE) setLocateError("Posisjon utilgjengelig.");
        else if (err.code === err.TIMEOUT) setLocateError("Tidsavbrudd.");
        else setLocateError("Kunne ikke hente posisjon.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const isAtDefault =
    active.label.trim().toLowerCase() === defaultLabel.trim().toLowerCase();

  const rootClass = transparent
    ? "p-3 md:p-4"
    : "panel rounded-lg p-4 md:p-5";

  // Inputstil: tilpasses gjennomsiktig flis (lysere ramme/tekst på mørk bakgrunn).
  const inputClass = transparent
    ? "w-full rounded-md border border-white/15 bg-white/5 text-white placeholder:text-white/50 px-3 py-2 text-base focus:outline-none focus:border-white/40"
    : "w-full rounded-md border border-border bg-background/60 px-3 py-2 text-base focus:outline-none focus:border-primary/60";

  const chipBtnClass = transparent
    ? "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] leading-tight text-white/90 transition-colors"
    : "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-card hover:bg-card/80 border border-border text-[10px] leading-tight text-foreground transition-colors";
  const iconBtnClass = transparent
    ? "px-2.5 py-2 rounded-md border border-white/15 bg-white/5 text-white hover:bg-white/15 transition-colors inline-flex items-center justify-center disabled:opacity-60"
    : "px-2.5 py-2 rounded-md border border-border text-foreground hover:bg-card/60 transition-colors inline-flex items-center justify-center disabled:opacity-60";

  return (
    <div className={rootClass}>
      {/* Topplinje: bruker + aktivt sted + favoritt-toggle */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        {(() => {
          let label: string;
          if (!authenticated) label = "Gjest";
          else if (!pushWho || pushWho === "Alle") label = "Velg bruker";
          else label = pushWho;
          return (
            <Link
              to="/agenda"
              className={`inline-flex items-center gap-2 text-xs uppercase tracking-wider transition-colors ${
                transparent ? "text-white/80 hover:text-white" : "text-primary hover:text-primary/80"
              }`}
              title="Endre bruker på Agenda"
            >
              <span className={`text-[10px] tracking-[0.25em] uppercase ${transparent ? "text-white/50" : "text-muted-foreground"}`}>
                Bruker:
              </span>
              <span>{label}</span>
            </Link>
          );
        })()}

        <div className="flex items-center gap-1.5 text-sm">
          <MapPin size={12} className={transparent ? "text-white/60" : "text-muted-foreground"} />
          <span className={`text-display tracking-wider truncate max-w-[14rem] ${transparent ? "text-white" : "text-primary"}`}>
            {active.label}
          </span>
          <button
            type="button"
            onClick={toggleFavorite}
            aria-label={isFavorite ? "Fjern fra favoritter" : "Legg til favoritter"}
            title={isFavorite ? "Fjern favoritt" : "Legg til favoritt"}
            className={`p-1 rounded transition-colors ${
              transparent ? "hover:bg-white/10" : "hover:bg-card"
            }`}
          >
            <Star
              size={14}
              className={
                isFavorite
                  ? "fill-yellow-400 text-yellow-400"
                  : transparent
                    ? "text-white/50"
                    : "text-muted-foreground"
              }
            />
          </button>
        </div>
      </div>

      {/* Søk + handlinger */}
      <div ref={wrap} className="relative mt-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => hits && setOpen(true)}
              placeholder="Søk sted i hele verden…"
              className={inputClass}
            />
            {searching && (
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider ${transparent ? "text-white/50" : "text-muted-foreground"}`}>
                Søker…
              </span>
            )}
          </div>
          {!hideActions && (
            <button
              type="button"
              disabled={locating}
              onClick={handleLocate}
              aria-label="Bruk min plassering"
              className={iconBtnClass}
              title="Bruk min plassering"
            >
              <span aria-hidden className="text-base leading-none">{locating ? "⏳" : "📍"}</span>
            </button>
          )}
          {!hideActions && (
            <button
              type="button"
              disabled={savingDefault || isAtDefault}
              onClick={handleSetDefault}
              className={`text-[10px] uppercase tracking-wider leading-tight px-2 py-1 rounded-md border transition-colors whitespace-normal text-center ${
                isAtDefault
                  ? transparent
                    ? "border-white/15 text-white/40 cursor-not-allowed"
                    : "border-border text-muted-foreground cursor-not-allowed opacity-60"
                  : savedFlash
                    ? transparent
                      ? "border-white text-white bg-white/15"
                      : "border-primary text-primary bg-primary/10"
                    : transparent
                      ? "border-white/40 text-white hover:bg-white/10"
                      : "border-primary/60 text-primary hover:bg-primary/10"
              }`}
            >
              {savingDefault ? "Lagrer…" : savedFlash ? "✓ Lagret" : (<><span className="block">Sett som</span><span className="block">standard</span></>)}
            </button>
          )}
        </div>

        {locateError && !hideActions && (
          <div className={`mt-2 text-[11px] ${transparent ? "text-red-300" : "text-destructive"}`}>{locateError}</div>
        )}

        {open && hits && hits.length > 0 && (
          <div className={`absolute left-0 right-0 mt-1 z-[100] rounded-xl border shadow-2xl max-h-72 overflow-y-auto ${transparent ? "border-white/20 bg-[#152238]/90 backdrop-blur-2xl" : "border-border bg-background"}`}>
            {hits.map((h, i) => (
              <button
                key={`${h.label}-${i}`}
                type="button"
                onClick={() => handlePick(h)}
                className={`w-full text-left px-3 py-2 border-b last:border-0 transition-colors ${transparent ? "hover:bg-white/10 border-white/10" : "hover:bg-card/80 border-border/40"}`}
              >
                <div className={`text-sm ${transparent ? "text-sky-100" : "text-foreground"}`}>{h.label}</div>
                <div className={`text-[10px] uppercase tracking-wider ${transparent ? "text-sky-300/70" : "text-muted-foreground"}`}>
                  {h.type}{h.fylke && ` · ${h.fylke}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {open && hits && hits.length === 0 && !searching && (
          <div className={`absolute left-0 right-0 mt-1 z-[100] rounded-xl border px-3 py-2 text-xs italic ${transparent ? "border-white/20 bg-[#152238]/90 backdrop-blur-2xl text-sky-200/80" : "border-border bg-background text-muted-foreground"}`}>
            Ingen treff. Prøv et annet stedsnavn.
          </div>
        )}
      </div>

      {/* Favoritter */}
      {favorites.length > 0 && (
        <div className="mt-3">
          <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] mb-1.5 ${transparent ? "text-white/50" : "text-muted-foreground"}`}>
            <Star size={10} className="fill-yellow-400 text-yellow-400" /> Favoritter
          </div>
          <div className="grid grid-cols-2 gap-2">
            {favorites.map((f) => (
              <span key={`fav-${f.label}`} className="flex items-stretch min-w-0">
                <button
                  type="button"
                  onClick={() => handlePickStored(f)}
                  className={`${chipBtnClass} rounded-r-none pr-1 flex-1 min-w-0`}
                  title={`Bytt til ${f.label}`}
                >
                  <span className="truncate">{f.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeFavorite(f)}
                  aria-label="Fjern favoritt"
                  title="Fjern favoritt"
                  className={`${chipBtnClass} rounded-l-none border-l-0 px-1.5`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

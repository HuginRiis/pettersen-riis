import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getStoredWho } from "@/lib/push-client";
import {
  reverseGeocode,
  searchPlaces,
  setDefaultLocation,
  setNameForCurrentIp,
  type PlaceHit,
  type WhoName,
  type LocationPage,
} from "@/server/user-locations";

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
  defaultLabel: string; // label of the saved default for this user (for "Tilbake til"-knapp)
  onChange: (loc: ActiveLocation) => void;
  onDefaultSaved?: (loc: ActiveLocation) => void;
  /** When false (offentlig/utlogget), hide Arne/Rebekka-velgeren og deaktiver "Sett som default". */
  authenticated?: boolean;
  /** Når true vises navnet kun som lesbar tekst — ingen velger, ingen "Vakt:"-etikett. */
  readOnlyWho?: boolean;
};

const NAMES: WhoName[] = ["Arne", "Rebekka"];

/**
 * Stedssøk-widget for Vær og Pollen. Lar brukeren:
 * - Bytte hvem de er (Arne/Rebekka) — lagres pr IP
 * - Søke i Kartverkets stedsregister
 * - Velge et søkeresultat som aktivt sted (lokalt, midlertidig)
 * - Sette aktivt sted som ny default for (navn, IP, side)
 */
export function LocationPicker({
  page,
  who,
  onWhoChange,
  active,
  defaultLabel,
  onChange,
  onDefaultSaved,
  authenticated = false,
  readOnlyWho = false,
}: Props) {
  const search = useServerFn(searchPlaces);
  const saveDefault = useServerFn(setDefaultLocation);
  const saveName = useServerFn(setNameForCurrentIp);
  const reverse = useServerFn(reverseGeocode);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrap.current) return;
      if (!wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handlePick = (h: PlaceHit) => {
    onChange({ label: h.label, lat: h.lat, lon: h.lon });
    setQuery("");
    setHits(null);
    setOpen(false);
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
    } catch {
      // ignore — UI will simply not flash
    } finally {
      setSavingDefault(false);
    }
  };

  const handleNameChange = async (newWho: WhoName) => {
    if (newWho === who) return;
    onWhoChange(newWho);
    try {
      await saveName({ data: { who: newWho } });
    } catch {
      /* fire-and-forget */
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
          onChange({ label: r.label, lat: r.lat, lon: r.lon });
        } catch {
          onChange({
            label: `${lat.toFixed(4)}°N ${lon.toFixed(4)}°Ø`,
            lat,
            lon,
          });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocateError("Posisjon avslått. Tillat plassering i nettleseren og prøv igjen.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocateError("Posisjon utilgjengelig akkurat nå.");
        } else if (err.code === err.TIMEOUT) {
          setLocateError("Tidsavbrudd ved henting av posisjon.");
        } else {
          setLocateError("Kunne ikke hente posisjon.");
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const isAtDefault =
    active.label.trim().toLowerCase() === defaultLabel.trim().toLowerCase();

  return (
    <div className="panel rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        {/* WHO — selector when allowed, lesbart navn når readOnlyWho */}
        {authenticated && readOnlyWho ? (
          <div className="text-xs uppercase tracking-wider text-primary">
            {who}
          </div>
        ) : authenticated ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
              Vakt:
            </span>
            <div className="flex rounded-md border border-border overflow-hidden">
              {NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleNameChange(n)}
                  className={`px-3 py-1 text-xs uppercase tracking-wider transition-colors ${
                    who === n
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-card/60"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            Stedssøk
          </div>
        )}

        {/* Active location chip */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            Sted:
          </span>
          <span className="text-primary text-display tracking-wider truncate max-w-[16rem]">
            {active.label}
          </span>
          {isAtDefault && (
            <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground border border-border rounded px-1.5 py-0.5">
              Default
            </span>
          )}
        </div>
      </div>

      {/* Search row */}
      <div ref={wrap} className="relative mt-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => hits && setOpen(true)}
              placeholder="Søk sted i Norge (Kartverket)…"
              className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Søker…
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={locating}
            onClick={handleLocate}
            className="text-xs uppercase tracking-wider px-3 py-2 rounded-md border border-border text-foreground hover:bg-card/60 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 disabled:opacity-60"
            title="Bruk min plassering (krever tillatelse i nettleseren)"
          >
            <span aria-hidden>📍</span>
            <span>{locating ? "Henter…" : "Min plassering"}</span>
          </button>
          <button
            type="button"
            disabled={savingDefault || isAtDefault}
            onClick={handleSetDefault}
            className={`text-xs uppercase tracking-wider px-3 py-2 rounded-md border transition-colors whitespace-nowrap ${
              isAtDefault
                ? "border-border text-muted-foreground cursor-not-allowed opacity-60"
                : savedFlash
                  ? "border-primary text-primary bg-primary/10"
                  : "border-primary/60 text-primary hover:bg-primary/10"
            }`}
            title={
              isAtDefault
                ? "Dette stedet er allerede default"
                : authenticated
                  ? `Sett som default for ${who} på denne IP-en`
                  : "Sett som default for denne IP-en"
            }
          >
            {savingDefault ? "Lagrer…" : savedFlash ? "✓ Lagret" : "Sett som default"}
          </button>
        </div>

        {locateError && (
          <div className="mt-2 text-[11px] text-destructive">{locateError}</div>
        )}

        {open && hits && hits.length > 0 && (
          <div className="absolute left-0 right-0 mt-1 z-30 rounded-md border border-border bg-background shadow-lg max-h-72 overflow-y-auto">
            {hits.map((h, i) => (
              <button
                key={`${h.label}-${i}`}
                type="button"
                onClick={() => handlePick(h)}
                className="w-full text-left px-3 py-2 hover:bg-card/80 border-b border-border/40 last:border-0"
              >
                <div className="text-sm text-foreground">{h.label}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {h.type}
                  {h.fylke && ` · ${h.fylke}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {open && hits && hits.length === 0 && !searching && (
          <div className="absolute left-0 right-0 mt-1 z-30 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground italic">
            Ingen treff i Kartverkets register.
          </div>
        )}
      </div>

      {!isAtDefault && defaultLabel && (
        <button
          type="button"
          onClick={() =>
            onChange({
              label: defaultLabel,
              // We only have the label here — caller will reload default lat/lon
              // via the parent's `defaultLoc` snapshot. To avoid a stale reset,
              // we emit a sentinel by simply re-emitting with current lat/lon
              // and letting the parent restore on next mount.
              lat: active.lat,
              lon: active.lon,
            })
          }
          className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors"
          // Hidden — actual "back to default" happens automatically on next mount.
          style={{ display: "none" }}
        >
          ↩ Tilbake til {defaultLabel}
        </button>
      )}
    </div>
  );
}

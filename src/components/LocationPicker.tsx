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
  const [pushWho, setPushWho] = useState<string>("Alle");

  // Hent valgt person fra varsling-systemet (samme som push-mottaker).
  useEffect(() => {
    setPushWho(getStoredWho());
    const onStorage = () => setPushWho(getStoredWho());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
        {/* Bruker-link — henter person fra varsling-systemet, lenker til /agenda for å endre */}
        {(() => {
          let label: string;
          if (!authenticated) {
            label = "Gjest";
          } else if (!pushWho || pushWho === "Alle") {
            label = "Velg bruker";
          } else {
            label = pushWho;
          }
          return (
            <Link
              to="/agenda"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
              title="Endre bruker på Agenda"
            >
              <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                Bruker:
              </span>
              <span>{label}</span>
            </Link>
          );
        })()}

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
            aria-label="Bruk min plassering"
            className="px-2.5 py-2 rounded-md border border-border text-foreground hover:bg-card/60 transition-colors inline-flex items-center justify-center disabled:opacity-60"
            title="Bruk min plassering (krever tillatelse i nettleseren)"
          >
            <span aria-hidden className="text-base leading-none">{locating ? "⏳" : "📍"}</span>
          </button>
          <button
            type="button"
            disabled={savingDefault || isAtDefault}
            onClick={handleSetDefault}
            className={`text-[10px] uppercase tracking-wider leading-tight px-2 py-1 rounded-md border transition-colors whitespace-normal text-center ${
              isAtDefault
                ? "border-border text-muted-foreground cursor-not-allowed opacity-60"
                : savedFlash
                  ? "border-primary text-primary bg-primary/10"
                  : "border-primary/60 text-primary hover:bg-primary/10"
            }`}
            title={
              isAtDefault
                ? "Dette stedet er allerede standard"
                : authenticated
                  ? `Sett som standard for ${who} på denne IP-en`
                  : "Sett som standard for denne IP-en"
            }
          >
            {savingDefault ? "Lagrer…" : savedFlash ? "✓ Lagret" : (<><span className="block">Sett som</span><span className="block">standard</span></>)}
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

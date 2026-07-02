import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Star } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { FancyWeatherTile } from "@/components/FancyWeatherTile";
import { UserLocationBar, useUserLocation } from "@/hooks/use-user-location";
import type { ActiveLocation } from "@/components/LocationPicker";
import { reverseGeocode } from "@/lib/user-locations.functions";

export const Route = createFileRoute("/varfavoritter")({
  head: () => ({
    meta: [
      { title: "Værfavoritter | House Pettersen Riis" },
      { name: "description", content: "Alle dine lagrede værsteder på ett sted, med animert vær." },
    ],
  }),
  component: FavoritesPage,
});

const FAV_KEY = "loc:fav:var";
const CHOSEN_KEY = "loc:chosen:var";

function readFavs(): ActiveLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.label === "string") : [];
  } catch {
    return [];
  }
}

function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function useBgGradient() {
  const [gradient, setGradient] = useState("from-[#3478c4] via-[#5a9bd4] to-[#9ec5e8]");
  useEffect(() => {
    const compute = () => {
      const h = new Date().getHours();
      if (h < 5 || h >= 22) setGradient("from-[#0b1426] via-[#142340] to-[#1c2e4f]");
      else if (h < 8) setGradient("from-[#3a4a6b] via-[#5d7a9e] to-[#a8b5c8]");
      else if (h >= 19) setGradient("from-[#1c2e4f] via-[#3a4a6b] to-[#6d4e3a]");
      else setGradient("from-[#3478c4] via-[#5a9bd4] to-[#9ec5e8]");
    };
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, []);
  return gradient;
}

function FavoritesPage() {
  const userLoc = useUserLocation("var");
  const bg = useBgGradient();
  const navigate = useNavigate();
  const reverse = useServerFn(reverseGeocode);
  const [favs, setFavs] = useState<ActiveLocation[]>([]);
  const [autoLocated, setAutoLocated] = useState(false);

  const pickLocation = (loc: ActiveLocation) => {
    try {
      localStorage.setItem(
        CHOSEN_KEY,
        JSON.stringify({ label: loc.label, lat: loc.lat, lon: loc.lon }),
      );
    } catch {
      // ignore
    }
    navigate({ to: "/var" });
  };

  useEffect(() => {
    setFavs(readFavs());
    const refresh = () => setFavs(readFavs());
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAV_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("loc-favs-changed", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("loc-favs-changed", refresh);
    };
  }, []);

  // Auto-geolokaliser toppboksen: viser stedet mobilen er hver gang siden åpnes.
  // Hvis GPS nektes/feiler → bruk nærmeste favoritt (om noen).
  useEffect(() => {
    if (autoLocated) return;
    if (!userLoc.ready) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setAutoLocated(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          const r = await reverse({ data: { lat, lon } });
          userLoc.setActive({ label: r.label, lat: r.lat, lon: r.lon });
        } catch {
          const list = readFavs();
          if (list.length) {
            const nearest = [...list].sort(
              (a, b) => distKm({ lat, lon }, a) - distKm({ lat, lon }, b),
            )[0];
            userLoc.setActive(nearest);
          } else {
            userLoc.setActive({ label: `${lat.toFixed(3)}°N ${lon.toFixed(3)}°Ø`, lat, lon });
          }
        } finally {
          setAutoLocated(true);
        }
      },
      () => {
        // Nektet / feilet — behold aktivt sted som er
        setAutoLocated(true);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoc.ready]);

  // Alltid vis aktivt sted øverst (som "høydepunkt"), + favoritter under
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: ActiveLocation[] = [];
    const add = (l: ActiveLocation) => {
      const k = l.label.trim().toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(l);
    };
    if (userLoc.active?.label) add(userLoc.active);
    favs.forEach(add);
    return out;
  }, [favs, userLoc.active]);

  return (
    <PageShell>
      <div className={`min-h-screen bg-gradient-to-b ${bg} transition-colors duration-1000 relative`}>
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-16 space-y-4 text-white relative z-10">
          <div className="flex items-center justify-between">
            <Link
              to="/var"
              className="inline-flex items-center gap-1.5 text-sm text-white/90 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} /> Tilbake til vær
            </Link>
            <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.25em] uppercase text-white/60">
              <Star size={11} className="fill-yellow-400 text-yellow-400" /> Favoritter
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-visible relative z-40">
            <UserLocationBar page="var" state={userLoc} transparent hideActions />
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center text-white/80 text-sm">
              Ingen favoritter enda. Søk etter et sted over og trykk stjerna for å lagre det som favoritt.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => pickLocation(f)}
                  className="block w-full text-left rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/40 transition-transform active:scale-[0.99]"
                  aria-label={`Åpne vær for ${f.label}`}
                >
                  <FancyWeatherTile label={f.label} lat={f.lat} lon={f.lon} />
                </button>
              ))}
            </div>

          )}
        </div>
      </div>
    </PageShell>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ArrowLeft, Star } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { FancyWeatherTile } from "@/components/FancyWeatherTile";
import { UserLocationBar, useUserLocation } from "@/hooks/use-user-location";
import type { ActiveLocation } from "@/components/LocationPicker";

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

function readFavs(): ActiveLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.label === "string") : [];
  } catch {
    return [];
  }
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
  const [favs, setFavs] = useState<ActiveLocation[]>([]);

  const pickLocation = (loc: ActiveLocation) => {
    try {
      sessionStorage.setItem(
        "loc:pending:var",
        JSON.stringify({ label: loc.label, lat: loc.lat, lon: loc.lon }),
      );
    } catch {
      // ignore
    }
    navigate({ to: "/var" });
  };

  // Når brukeren søker/velger et nytt sted i søkeboksen: send det som pending
  // pick og naviger tilbake til vær-siden i stedet for å bare oppdatere aktivt
  // sted lokalt.
  const barState = useMemo(
    () => ({
      ...userLoc,
      setActive: (loc: ActiveLocation) => pickLocation(loc),
    }),
    // pickLocation er stabil i denne komponenten
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userLoc.who, userLoc.active, userLoc.defaultLoc, userLoc.ready, userLoc.authenticated],
  );



  useEffect(() => {
    setFavs(readFavs());
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAV_KEY) setFavs(readFavs());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
            <UserLocationBar page="var" state={barState} transparent />
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

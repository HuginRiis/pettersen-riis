import { useEffect, useRef } from "react";

export type MapPlace = {
  place: string;
  visits: number;
  km: number;
  lat: number | null;
  lon: number | null;
};

/**
 * Kart over mest besøkte destinasjoner. Punktstørrelsen skalerer med antall besøk.
 * SSR-trygg: Leaflet lastes kun på klient.
 */
export function PlacesMap({ places }: { places: MapPlace[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  const pts = places.filter(
    (p): p is MapPlace & { lat: number; lon: number } => p.lat != null && p.lon != null,
  );

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;
    if (pts.length === 0) return;

    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, subdomains: "abcd" },
      ).addTo(map);

      const maxVisits = Math.max(...pts.map((p) => p.visits));

      for (const p of pts) {
        const scale = maxVisits > 1 ? (p.visits - 1) / (maxVisits - 1) : 1;
        const radius = 8 + Math.sqrt(scale) * 26;
        L.circleMarker([p.lat, p.lon], {
          radius,
          color: "#c9a74a",
          weight: 2,
          fillColor: "#c9a74a",
          fillOpacity: 0.28,
        })
          .bindPopup(
            `<div style="font-family:system-ui;min-width:140px">
               <div style="font-weight:600;margin-bottom:2px">${p.place}</div>
               <div style="font-size:12px;opacity:.8">${p.visits} besøk · ${p.km.toLocaleString(
                 "nb-NO",
                 { maximumFractionDigits: 1 },
               )} km</div>
             </div>`,
          )
          .addTo(map);
      }

      map.fitBounds(
        pts.map((p) => [p.lat, p.lon] as [number, number]),
        { padding: [30, 30], maxZoom: 12 },
      );
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [JSON.stringify(pts)]);

  if (pts.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-md">
        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Ingen posisjonsdata i kjøreloggen
        </span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full rounded-md overflow-hidden" />;
}

import { useEffect, useRef } from "react";

/**
 * Kartkomponent for GPS-rute (array av [lat, lon]).
 * Bruker Leaflet med CartoDB Voyager-tiles (Google-Maps-lignende utseende).
 */
export function RouteMap({ coords }: { coords: [number, number][] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;
    if (coords.length === 0) return;

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

      const line = L.polyline(coords, {
        color: "#c9a74a",
        weight: 5,
        opacity: 0.95,
      }).addTo(map);

      // Start- og sluttmarkører
      const startIcon = L.divIcon({
        className: "route-start",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#4ade80;border:3px solid #1a1a1a;box-shadow:0 0 8px #4ade80;"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const endIcon = L.divIcon({
        className: "route-end",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#d96666;border:3px solid #1a1a1a;box-shadow:0 0 8px #d96666;"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker(coords[0], { icon: startIcon }).addTo(map).bindPopup("Start");
      L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(map).bindPopup("Slutt");

      map.fitBounds(line.getBounds(), { padding: [24, 24] });
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [coords]);

  if (coords.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-md">
        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Ingen GPS-data for denne økta
        </span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full rounded-md overflow-hidden" />;
}

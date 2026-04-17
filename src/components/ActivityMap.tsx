import { useEffect, useRef } from "react";
import polyline from "@mapbox/polyline";

export function ActivityMap({ encoded }: { encoded: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const coords = polyline.decode(encoded) as [number, number][];
      if (coords.length === 0) return;

      // Tear down any prior map on this container
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      const line = L.polyline(coords, {
        color: "#c9a74a",
        weight: 4,
        opacity: 0.9,
      }).addTo(map);

      map.fitBounds(line.getBounds(), { padding: [16, 16] });
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [encoded]);

  return <div ref={containerRef} className="w-full h-full" />;
}

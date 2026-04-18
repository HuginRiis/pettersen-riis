import { useEffect, useRef } from "react";

export function TripPointMap({
  lat,
  lon,
  label,
}: {
  lat: number;
  lon: number;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;

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
      }).setView([lat, lon], 12);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      const icon = L.divIcon({
        className: "trip-marker",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#c9a74a;border:3px solid #1a1a1a;box-shadow:0 0 12px #c9a74a;"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      L.marker([lat, lon], { icon }).addTo(map).bindPopup(label);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lon, label]);

  return <div ref={containerRef} className="w-full h-full rounded-md overflow-hidden" />;
}

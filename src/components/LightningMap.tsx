import { useEffect, useRef } from "react";
import type { LightningStrike } from "@/server/lightning";

type Props = {
  center: { lat: number; lon: number };
  radiusKm: number;
  strikes: LightningStrike[];
};

export function LightningMap({ center, radiusKm, strikes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

  // Init map (once)
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
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: true,
        doubleClickZoom: false,
      }).setView([center.lat, center.lon], 8);
      mapRef.current = map;

      // Dark themed tiles for GoT vibe
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 12, subdomains: "abcd" },
      ).addTo(map);

      // Center marker (Tollnes)
      const goldIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:14px;height:14px;border-radius:9999px;
          background:oklch(0.78 0.14 80);
          box-shadow:0 0 0 3px oklch(0.78 0.14 80 / 0.25), 0 0 18px oklch(0.78 0.14 80 / 0.7);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([center.lat, center.lon], { icon: goldIcon })
        .addTo(map)
        .bindTooltip("Tollnes", {
          permanent: false,
          direction: "top",
          className: "lightning-tooltip",
        });

      // Radius ring
      L.circle([center.lat, center.lon], {
        radius: radiusKm * 1000,
        color: "oklch(0.72 0.13 75)",
        weight: 1,
        opacity: 0.4,
        fillColor: "oklch(0.72 0.13 75)",
        fillOpacity: 0.04,
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lon, radiusKm]);

  // Update strikes when they change
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current || !layerRef.current) return;
      layerRef.current.clearLayers();

      const now = Date.now();
      for (const s of strikes) {
        const ageMin = (now - new Date(s.time).getTime()) / 60000;
        const fresh = ageMin < 15;
        const opacity = Math.max(0.25, 1 - ageMin / 60);
        const color = fresh ? "oklch(0.78 0.18 60)" : "oklch(0.55 0.20 25)";
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:18px;height:18px;border-radius:9999px;
            background:${color};
            opacity:${opacity};
            box-shadow:0 0 12px ${color}, 0 0 4px ${color};
            display:flex;align-items:center;justify-content:center;
            font-size:11px;color:#000;font-weight:900;
          ">⚡</div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        L.marker([s.lat, s.lon], { icon })
          .addTo(layerRef.current)
          .bindTooltip(
            `${new Date(s.time).toLocaleTimeString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
            })} · ${s.distanceKm.toFixed(0)} km · ${s.current.toFixed(0)} kA`,
            { className: "lightning-tooltip" },
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [strikes]);

  return <div ref={containerRef} className="w-full h-full" />;
}

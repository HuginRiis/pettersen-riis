import { useEffect, useRef } from "react";
import type { TelemarkAlert } from "@/server/met-alerts";

/**
 * AlertsMap — viser alle aktive farevarsler som polygoner på et Leaflet-kart.
 * Sentrert på Sør- og Østlandet. SSR-trygg (laster Leaflet kun på klient).
 */
export function AlertsMap({ alerts }: { alerts: TelemarkAlert[] }) {
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
      }).setView([59.4, 9.5], 7);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      const colorFor = (c: string | null) =>
        c === "Red" ? "#dc2626" : c === "Orange" ? "#ea580c" : "#eab308";

      const bounds: [number, number][] = [];

      for (const a of alerts) {
        const color = colorFor(a.riskMatrixColor);
        const g = a.geometry;
        if (!g) continue;

        const popupHtml = `
          <div style="font-family:system-ui;max-width:260px">
            <div style="font-weight:600;color:${color};margin-bottom:4px">
              ${a.eventAwarenessName ?? a.event}
            </div>
            ${a.area ? `<div style="font-size:12px;opacity:.8;margin-bottom:6px">${a.area}</div>` : ""}
            ${a.description ? `<div style="font-size:12px;line-height:1.35">${a.description}</div>` : ""}
          </div>
        `;

        try {
          if (g.type === "Polygon" || g.type === "MultiPolygon") {
            const layer = L.geoJSON(g as any, {
              style: {
                color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.18,
              },
            }).bindPopup(popupHtml);
            layer.addTo(map);
            const b = layer.getBounds();
            if (b.isValid()) {
              bounds.push([b.getSouth(), b.getWest()]);
              bounds.push([b.getNorth(), b.getEast()]);
            }
          } else if (g.type === "Point") {
            const [lon, lat] = g.coordinates;
            L.circleMarker([lat, lon], {
              radius: 8,
              color,
              fillColor: color,
              fillOpacity: 0.5,
            })
              .bindPopup(popupHtml)
              .addTo(map);
            bounds.push([lat, lon]);
          }
        } catch (e) {
          console.warn("Klarte ikke tegne varsel:", a.id, e);
        }
      }

      if (bounds.length > 0) {
        try {
          map.fitBounds(bounds, { padding: [20, 20], maxZoom: 9 });
        } catch {
          // ignore
        }
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [alerts]);

  return <div ref={containerRef} className="w-full h-full rounded-md overflow-hidden" />;
}

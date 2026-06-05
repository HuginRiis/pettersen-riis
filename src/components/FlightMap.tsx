import { useEffect, useState } from "react";
import type { Flight } from "@/lib/flights.functions";

type Props = {
  center: { lat: number; lon: number };
  label: string;
  radiusKm: number;
  flights: Flight[];
};

// Leaflet bruker window — last kun på klient.
export function FlightMap({ center, label, radiusKm, flights }: Props) {
  const [mounted, setMounted] = useState(false);
  const [mod, setMod] = useState<null | {
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
    Marker: typeof import("react-leaflet").Marker;
    Circle: typeof import("react-leaflet").Circle;
    Popup: typeof import("react-leaflet").Popup;
    useMap: typeof import("react-leaflet").useMap;
    L: typeof import("leaflet");
  }>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rl, L] = await Promise.all([
        import("react-leaflet"),
        import("leaflet"),
      ]);
      await import("leaflet/dist/leaflet.css");
      if (cancelled) return;
      setMod({
        MapContainer: rl.MapContainer,
        TileLayer: rl.TileLayer,
        Marker: rl.Marker,
        Circle: rl.Circle,
        Popup: rl.Popup,
        useMap: rl.useMap,
        L: L.default ?? L,
      });
      setMounted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted || !mod) {
    return (
      <div
        className="w-full rounded-lg border border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground"
        style={{ height: 320 }}
      >
        Laster kart…
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Circle, Popup, L } = mod;

  // Senterets ikon
  const homeIcon = L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:hsl(var(--primary, 220 90% 56%));border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  const planeIcon = (rotation: number | null, emergency: boolean) =>
    L.divIcon({
      className: "",
      html: `<div style="transform:rotate(${rotation ?? 0}deg);font-size:20px;line-height:1;color:${emergency ? "#ef4444" : "#0ea5e9"};text-shadow:0 0 2px rgba(0,0,0,0.8)">✈</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

  return (
    <div className="rounded-lg overflow-hidden border border-border" style={{ height: 320 }}>
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={radiusKm > 80 ? 8 : radiusKm > 40 ? 9 : 10}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={[center.lat, center.lon]}
          radius={radiusKm * 1000}
          pathOptions={{ color: "#0ea5e9", weight: 1, fillOpacity: 0.05 }}
        />
        <Marker position={[center.lat, center.lon]} icon={homeIcon}>
          <Popup>{label}</Popup>
        </Marker>
        {flights.map((f) => (
          <Marker
            key={f.icao24}
            position={[f.latitude, f.longitude]}
            icon={planeIcon(f.trueTrack, f.emergency != null && f.emergency !== "none")}
          >
            <Popup>
              <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                <strong>{f.callsign || f.icao24.toUpperCase()}</strong>
                <br />
                {f.distanceKm.toFixed(1)} km · {f.baroAltitudeM != null ? `${(f.baroAltitudeM / 1000).toFixed(1)} km` : "?"}
                {f.velocityMs != null && <> · {Math.round(f.velocityMs * 3.6)} km/t</>}
                {f.registration && <><br />{f.registration}</>}
                {f.aircraftType && <> · {f.aircraftType}</>}
                {f.operator && <><br />{f.operator}</>}
                {(f.routeFromName || f.routeToName) && (
                  <>
                    <br />
                    {f.routeFromName ?? "?"} → {f.routeToName ?? "?"}
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

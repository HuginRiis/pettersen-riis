import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Layers } from "lucide-react";
import { useUserLocation } from "@/hooks/use-user-location";

export const Route = createFileRoute("/varkart")({
  head: () => ({
    meta: [
      { title: "Værkart · Live" },
      { name: "description", content: "Live værkart med nedbør, temperatur, vind og mer." },
    ],
  }),
  component: VarkartPage,
});

const OVERLAYS: { key: string; label: string; icon: string }[] = [
  { key: "rain", label: "Nedbør", icon: "☔" },
  { key: "temp", label: "Temperatur", icon: "🌡" },
  { key: "wind", label: "Vind", icon: "💨" },
  { key: "gust", label: "Vindkast", icon: "🌬" },
  { key: "clouds", label: "Skyer", icon: "☁️" },
  { key: "thunder", label: "Torden", icon: "⚡" },
  { key: "snowAccu", label: "Snø", icon: "❄️" },
  { key: "pressure", label: "Trykk", icon: "🜨" },
  { key: "rh", label: "Luftfuktighet", icon: "💧" },
  { key: "visibility", label: "Sikt", icon: "👁" },
  { key: "fog", label: "Tåke", icon: "🌫" },
  { key: "uvIndex", label: "UV-indeks", icon: "🔆" },
  { key: "satellite", label: "Satellitt", icon: "🛰" },
  { key: "radar", label: "Radar", icon: "📡" },
];

function VarkartPage() {
  const router = useRouter();
  const userLoc = useUserLocation();
  const [overlay, setOverlay] = useState<string>("rain");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const lat = userLoc.lat ?? 59.6;
  const lon = userLoc.lon ?? 9.2;

  const src = useMemo(() => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      zoom: "7",
      level: "surface",
      overlay,
      product: "ecmwf",
      menu: "",
      message: "",
      marker: "true",
      calendar: "now",
      pressure: "",
      type: "map",
      location: "coordinates",
      metricWind: "m/s",
      metricTemp: "°C",
      radarRange: "-1",
    });
    return `https://embed.windy.com/embed2.html?${params.toString()}`;
  }, [lat, lon, overlay]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  const activeLabel = OVERLAYS.find((o) => o.key === overlay)?.label ?? "";

  return (
    <div className="fixed inset-0 bg-slate-900 text-white">
      <iframe
        key={overlay}
        title={`Værkart — ${overlay}`}
        src={src}
        className="absolute inset-0 w-full h-full border-0"
        loading="eager"
        referrerPolicy="no-referrer"
        allow="fullscreen; geolocation"
      />

      {/* Close button (top-left) */}
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) router.history.back();
          else router.navigate({ to: "/var" });
        }}
        aria-label="Lukk værkart"
        className="absolute top-[max(env(safe-area-inset-top),1rem)] left-4 z-20 w-11 h-11 rounded-full bg-white/90 backdrop-blur-xl shadow-lg flex items-center justify-center text-slate-800 hover:bg-white active:scale-95 transition-all"
      >
        <X size={20} />
      </button>

      {/* Overlay picker (top-right) */}
      <div
        ref={pickerRef}
        className="absolute top-[max(env(safe-area-inset-top),1rem)] right-4 z-20"
      >
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="flex items-center gap-2 px-4 h-11 rounded-2xl bg-white/90 backdrop-blur-xl shadow-lg text-slate-800 hover:bg-white active:scale-95 transition-all"
        >
          <Layers size={16} />
          <span className="text-sm font-medium">{activeLabel}</span>
        </button>

        {pickerOpen && (
          <div className="mt-2 p-2 rounded-2xl bg-white/95 backdrop-blur-xl shadow-2xl w-[240px] max-h-[70vh] overflow-y-auto">
            {OVERLAYS.map((o) => {
              const active = o.key === overlay;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    setOverlay(o.key);
                    setPickerOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-slate-800 text-[15px] transition-colors ${
                    active ? "bg-slate-100 font-semibold" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="w-5 text-center text-base">{active ? "✓" : ""}</span>
                  <span className="text-lg leading-none">{o.icon}</span>
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

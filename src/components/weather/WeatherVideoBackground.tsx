import { useMemo } from "react";
import type { GlassKind } from "./WeatherFX";
import clearAsset from "@/assets/weather-bg/clear.mp4.asset.json";
import cloudsAsset from "@/assets/weather-bg/clouds.mp4.asset.json";
import rainAsset from "@/assets/weather-bg/rain.mp4.asset.json";
import snowAsset from "@/assets/weather-bg/snow.mp4.asset.json";
import thunderAsset from "@/assets/weather-bg/thunder.mp4.asset.json";
import fogAsset from "@/assets/weather-bg/fog.mp4.asset.json";

function videoForKind(kind: GlassKind): { url: string; dim: number } {
  switch (kind) {
    case "rain":
      return { url: rainAsset.url, dim: 0.45 };
    case "sleet":
      return { url: rainAsset.url, dim: 0.5 };
    case "thunder":
      return { url: thunderAsset.url, dim: 0.55 };
    case "snow":
      return { url: snowAsset.url, dim: 0.25 };
    case "fog":
      return { url: fogAsset.url, dim: 0.4 };
    case "cloudy":
      return { url: cloudsAsset.url, dim: 0.45 };
    case "partly":
      return { url: cloudsAsset.url, dim: 0.35 };
    case "fair":
    case "clear":
      return { url: clearAsset.url, dim: 0.25 };
    case "night":
      return { url: cloudsAsset.url, dim: 0.7 };
    case "night-clear":
      return { url: clearAsset.url, dim: 0.7 };
    default:
      return { url: clearAsset.url, dim: 0.35 };
  }
}

export function WeatherVideoBackground({ kind }: { kind: GlassKind }) {
  const { url, dim } = useMemo(() => videoForKind(kind), [kind]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <video
        key={url}
        src={url}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "saturate(1.05)" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `rgba(8, 14, 28, ${dim})` }}
      />
    </div>
  );
}

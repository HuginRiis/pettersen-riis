import { useMemo } from "react";
import type { GlassKind } from "./WeatherFX";
import clearAsset from "@/assets/weather-bg/clear.mp4.asset.json";
import cloudsAsset from "@/assets/weather-bg/clouds.mp4.asset.json";
import rainAsset from "@/assets/weather-bg/rain.mp4.asset.json";
import snowAsset from "@/assets/weather-bg/snow.mp4.asset.json";
import thunderAsset from "@/assets/weather-bg/thunder.mp4.asset.json";
import fogAsset from "@/assets/weather-bg/fog.mp4.asset.json";

function videoForKind(kind: GlassKind): { url: string } {
  switch (kind) {
    case "rain":
      return { url: rainAsset.url };
    case "sleet":
      return { url: rainAsset.url };
    case "thunder":
      return { url: thunderAsset.url };
    case "snow":
      return { url: snowAsset.url };
    case "fog":
      return { url: fogAsset.url };
    case "cloudy":
      return { url: cloudsAsset.url };
    case "partly":
      return { url: cloudsAsset.url };
    case "fair":
    case "clear":
      return { url: clearAsset.url };
    case "night":
      return { url: cloudsAsset.url };
    case "night-clear":
      return { url: clearAsset.url };
    default:
      return { url: clearAsset.url };
  }
}

export function WeatherVideoBackground({ kind }: { kind: GlassKind }) {
  const { url } = useMemo(() => videoForKind(kind), [kind]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
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
    </div>
  );
}


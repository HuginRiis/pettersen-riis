import { useEffect, useMemo, useState } from "react";

type Drop = {
  id: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
};

/**
 * Vanndråper på glasset — vises kun når det er nedbør nå.
 * Jo mer nedbør, jo flere og større dråper. Enkelte dråper renner
 * sakte nedover som på et vindu.
 *
 * `force` kan sette en fast intensitet 0..1 (for testing/preview).
 */
export function RainOnGlass({
  lat = 59.1789,
  lon = 9.5732,
  className = "",
  force,
}: {
  lat?: number;
  lon?: number;
  className?: string;
  force?: number;
}) {
  const [precip, setPrecip] = useState<number | null>(null);

  useEffect(() => {
    if (force != null) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        const data: any = await r.json();
        const ts = data?.properties?.timeseries?.[0];
        const mm =
          ts?.data?.next_1_hours?.details?.precipitation_amount ??
          ts?.data?.next_6_hours?.details?.precipitation_amount ??
          0;
        if (!cancelled) setPrecip(Number(mm) || 0);
      } catch {
        if (!cancelled) setPrecip(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, force]);

  // Intensitet 0..1
  const intensity = useMemo(() => {
    if (force != null) return Math.max(0, Math.min(1, force));
    if (precip == null) return 0;
    if (precip <= 0) return 0;
    return Math.min(1, precip / 4);
  }, [precip, force]);

  const drops = useMemo<Drop[]>(() => {
    if (intensity <= 0) return [];
    const count = Math.round(14 + intensity * 42);
    const arr: Drop[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 3 + Math.random() * (6 + intensity * 8),
        delay: -Math.random() * 6,
        duration: 4 + Math.random() * 6,
        drift: (Math.random() - 0.5) * 4,
      });
    }
    return arr;
  }, [intensity]);

  const runners = useMemo(() => {
    if (intensity <= 0.15) return [];
    const count = Math.round(2 + intensity * 6);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: 8 + Math.random() * 84,
      delay: -Math.random() * 8,
      duration: 5 + Math.random() * 6,
      width: 2 + Math.random() * 2,
      height: 10 + Math.random() * 22,
    }));
  }, [intensity]);

  if (intensity <= 0) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-lg ${className}`}
      aria-hidden
    >
      <style>{`
        @keyframes rog-bead {
          0%, 70% { transform: translate(0,0); opacity: var(--o, 0.85); }
          85% { transform: translate(var(--dx,0px), 6px); opacity: var(--o, 0.85); }
          100% { transform: translate(var(--dx,0px), 22px); opacity: 0; }
        }
        @keyframes rog-run {
          0% { transform: translateY(-30%); opacity: 0; }
          15% { opacity: 0.9; }
          100% { transform: translateY(140%); opacity: 0; }
        }
      `}</style>
      {drops.map((d) => (
        <span
          key={`b-${d.id}`}
          style={{
            position: "absolute",
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85), rgba(255,255,255,0.15) 55%, rgba(255,255,255,0.02) 75%)",
            boxShadow:
              "inset 0 -1px 1px rgba(255,255,255,0.5), 0 1px 1px rgba(0,0,0,0.15)",
            filter: "blur(0.2px)",
            animation: `rog-bead ${d.duration}s ease-in ${d.delay}s infinite`,
            // @ts-ignore css vars
            "--dx": `${d.drift}px`,
            "--o": 0.7 + Math.random() * 0.25,
          } as any}
        />
      ))}
      {runners.map((r) => (
        <span
          key={`r-${r.id}`}
          style={{
            position: "absolute",
            left: `${r.left}%`,
            top: 0,
            width: r.width,
            height: r.height,
            borderRadius: r.width,
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.0), rgba(255,255,255,0.75))",
            filter: "blur(0.4px)",
            animation: `rog-run ${r.duration}s linear ${r.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

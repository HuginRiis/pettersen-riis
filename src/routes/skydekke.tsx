import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { useUserLocation } from "@/hooks/use-user-location";
import { ArrowLeft, CloudFog } from "lucide-react";

export const Route = createFileRoute("/skydekke")({
  head: () => ({
    meta: [
      { title: "Skydekke — Detaljer | House Pettersen Riis" },
      { name: "description", content: "Skydekke time for time, 12 søyler over 24 timer." },
    ],
  }),
  component: SkydekkePage,
});

type Hour = { time: string; cloud: number };

function SkydekkePage() {
  const userLoc = useUserLocation("var");
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${userLoc.active.lat}&lon=${userLoc.active.lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("Kunne ikke hente værmelding");
        const json = await res.json();
        const series: any[] = json?.properties?.timeseries ?? [];
        const out: Hour[] = [];
        for (const e of series.slice(0, 30)) {
          const c = e?.data?.instant?.details?.cloud_area_fraction;
          if (typeof c !== "number") continue;
          out.push({ time: e.time, cloud: c });
        }
        if (!cancelled) setHours(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ukjent feil");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userLoc.active.lat, userLoc.active.lon]);

  // 12 bars × 2h = 24h
  const bars = useMemo(() => {
    if (!hours) return null;
    const out: { startTime: string; cloud: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = hours[i * 2]?.cloud ?? 0;
      const b = hours[i * 2 + 1]?.cloud ?? a;
      out.push({
        startTime: hours[i * 2]?.time ?? new Date(Date.now() + i * 2 * 3600 * 1000).toISOString(),
        cloud: (a + b) / 2,
      });
    }
    return out;
  }, [hours]);

  const avg = useMemo(() => {
    if (!bars) return 0;
    return bars.reduce((s, b) => s + b.cloud, 0) / bars.length;
  }, [bars]);

  const intensity = Math.min(1, avg / 100);

  return (
    <PageShell>
      <main className="min-h-screen bg-gradient-to-b from-[#1f2937] via-[#3b4860] to-[#5b6b85] text-white">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-16 space-y-4">
          <Link
            to="/var"
            className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <ArrowLeft size={16} /> Tilbake til vær
          </Link>

          <header className="flex items-center gap-2">
            <CloudFog size={18} />
            <h1 className="text-2xl font-semibold tracking-tight">Skydekke · neste 24 t</h1>
          </header>
          <p className="text-sm text-white/70">{userLoc.active.label}</p>

          {error && <p className="text-sm text-red-300">{error}</p>}

          {!bars && !error && (
            <div className="h-72 rounded-2xl bg-white/5 animate-pulse" />
          )}

          {bars && (
            <article className="relative overflow-hidden rounded-2xl bg-white/8 backdrop-blur-xl border border-white/10 shadow-lg p-5">
              {/* Layout: animasjon (venstre) | grafer (midten) | prosent (høyre) */}
              <div className="grid grid-cols-[88px_1fr_96px] gap-4 items-stretch">
                {/* VENSTRE: skyanimasjon — strengt avgrenset til denne kolonnen */}
                <div className="relative h-64 rounded-xl bg-gradient-to-b from-sky-900/40 to-slate-900/40 overflow-hidden border border-white/10">
                  <CloudAnimation intensity={intensity} />
                  <div className="absolute bottom-1 left-0 right-0 text-center text-[10px] uppercase tracking-wider text-white/60">
                    Visuelt
                  </div>
                </div>

                {/* MIDTEN: 12 søyler, 2t hver */}
                <div className="h-64 flex flex-col">
                  <div className="flex-1 flex items-end gap-1.5">
                    {bars.map((b, i) => {
                      const h = Math.max(4, b.cloud);
                      const l = Math.round(235 - b.cloud * 1.8); // mørk når tett
                      const col = `rgb(${l},${l},${Math.min(255, l + 12)})`;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="text-[9px] text-white/70 tabular-nums">
                            {Math.round(b.cloud)}
                          </div>
                          <div className="w-full h-44 relative rounded-md bg-white/10 overflow-hidden">
                            <div
                              className="absolute bottom-0 left-0 right-0 rounded-md transition-all"
                              style={{
                                height: `${h}%`,
                                background: `linear-gradient(to top, ${col}, rgba(255,255,255,0.18))`,
                              }}
                            />
                          </div>
                          <div className="text-[9px] text-white/60 tabular-nums">
                            {fmtHour(b.startTime)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-center text-[10px] uppercase tracking-wider text-white/60">
                    12 søyler · 2 timer pr bar
                  </div>
                </div>

                {/* HØYRE: snitt-prosent hele dagen */}
                <div className="flex flex-col items-center justify-center rounded-xl bg-white/10 border border-white/15 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-white/70 text-center mb-1">
                    Hele dagen
                  </div>
                  <div className="text-4xl font-semibold tabular-nums leading-none">
                    {Math.round(avg)}
                    <span className="text-base text-white/70">%</span>
                  </div>
                  <div className="text-[10px] text-white/60 mt-2 text-center">
                    {labelFor(avg)}
                  </div>
                </div>
              </div>
            </article>
          )}
        </div>
      </main>
    </PageShell>
  );
}

function labelFor(avg: number) {
  if (avg < 25) return "Stort sett klart";
  if (avg < 60) return "Vekslende";
  if (avg < 85) return "Mye skyet";
  return "Tett overskyet";
}

function fmtHour(iso: string) {
  const d = new Date(iso);
  return d.getHours().toString().padStart(2, "0");
}

function CloudAnimation({ intensity }: { intensity: number }) {
  // antall skyer skalerer med skydekke (3..10)
  const count = Math.max(3, Math.round(3 + intensity * 7));
  const clouds = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        top: 10 + ((i * 37) % 70),
        delay: (i * 0.7) % 6,
        duration: 8 + ((i * 1.3) % 6),
        scale: 0.6 + ((i * 0.19) % 0.7),
        opacity: 0.35 + intensity * 0.55,
      })),
    [count, intensity],
  );
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes skydekkeDrift {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
      `}</style>
      {clouds.map((c, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: `${c.top}%`,
            left: 0,
            right: 0,
            animation: `skydekkeDrift ${c.duration}s linear ${c.delay}s infinite`,
            opacity: c.opacity,
            transform: `scale(${c.scale})`,
          }}
        >
          <div
            style={{
              width: 60,
              height: 22,
              borderRadius: 999,
              background:
                "radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.95), rgba(220,228,240,0.6) 60%, rgba(200,210,225,0.2))",
              filter: "blur(1px)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            }}
          />
        </div>
      ))}
      {/* mørk overlay som styrker "tett dekke" når intensity er høy */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `rgba(20,25,40,${0.15 * intensity})` }}
      />
    </div>
  );
}
